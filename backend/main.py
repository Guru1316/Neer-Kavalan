from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from datetime import datetime, timedelta
from zoneinfo import ZoneInfo
from typing import List, Dict, Any, Optional
import os
from dotenv import load_dotenv
import random
from pydantic import BaseModel
import threading
import time
from collections import defaultdict
from pymongo import MongoClient
from bson import ObjectId
import json

# Load environment variables
load_dotenv()

# Initialize MongoDB
mongodb_initialized = False
db = None
readings_collection = None
alerts_collection = None

try:
    mongodb_uri = os.getenv('MONGODB_URI')
    
    if not mongodb_uri:
        print("❌ MONGODB_URI not set in .env file")
    else:
        # Create MongoDB client
        client = MongoClient(mongodb_uri)
        db_name = os.getenv('MONGODB_DATABASE', 'aquaalert')
        db = client[db_name]
        
        # Create collections
        readings_collection = db['water_readings']
        alerts_collection = db['alerts']
        
        # Create indexes for better performance
        readings_collection.create_index('village_name')
        readings_collection.create_index('timestamp')
        alerts_collection.create_index('timestamp')
        alerts_collection.create_index('village_name')
        
        mongodb_initialized = True
        print("✅ MongoDB initialized successfully")
        
        # Test connection
        test_doc = {"test": True, "timestamp": datetime.now().isoformat()}
        readings_collection.insert_one(test_doc)
        readings_collection.delete_one({"test": True})
        print("✅ MongoDB write test successful")
        
except Exception as e:
    print(f"❌ MongoDB initialization error: {e}")
    mongodb_initialized = False
    db = None
    readings_collection = None
    alerts_collection = None

app = FastAPI(title="AquaAlert AI API")

# CORS middleware
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Village list with coordinates for map
VILLAGES = [
    {"name": "Adagappadi", "lat": 12.08, "lng": 78.12},
    {"name": "Akkamanahalli", "lat": 12.09, "lng": 78.14},
    {"name": "Aandihalli", "lat": 12.10, "lng": 78.10},
    {"name": "A.Gollahalli", "lat": 12.11, "lng": 78.16},
    {"name": "HaleDharmapuri", "lat": 12.12, "lng": 78.15},
    {"name": "Kadagathur", "lat": 12.13, "lng": 78.18},
    {"name": "Kondampatti", "lat": 12.14, "lng": 78.13},
    {"name": "Kondagarahalli", "lat": 12.15, "lng": 78.19},
    {"name": "Konanginaickanahalli", "lat": 12.16, "lng": 78.11},
    {"name": "Koduhalli", "lat": 12.17, "lng": 78.20},
    {"name": "Krishnapuram", "lat": 12.18, "lng": 78.17},
    {"name": "Kuppur", "lat": 12.19, "lng": 78.22},
    {"name": "Lakkiyampatti", "lat": 12.20, "lng": 78.14},
    {"name": "Mookanur", "lat": 12.21, "lng": 78.16},
    {"name": "Naickanahalli", "lat": 12.22, "lng": 78.18},
    {"name": "K.Naduhalli", "lat": 12.23, "lng": 78.12},
    {"name": "Nallasenahalli", "lat": 12.24, "lng": 78.15},
    {"name": "Noolahalli", "lat": 12.25, "lng": 78.20},
    {"name": "Puluthikarai", "lat": 12.26, "lng": 78.13},
    {"name": "Semmandakuppam", "lat": 12.27, "lng": 78.17},
    {"name": "Settikarai", "lat": 12.28, "lng": 78.19},
    {"name": "Sogathur", "lat": 12.29, "lng": 78.14},
    {"name": "Thippireddihalli", "lat": 12.30, "lng": 78.16},
    {"name": "Unguranahalli", "lat": 12.31, "lng": 78.21},
    {"name": "Vellalapatti", "lat": 12.32, "lng": 78.18},
    {"name": "Vellolai", "lat": 12.33, "lng": 78.15},
    {"name": "V.Muthampatti", "lat": 12.34, "lng": 78.22},
    {"name": "Mukkalnaickanpatti", "lat": 12.35, "lng": 78.19}
]

# Get village names list
VILLAGE_NAMES = [v["name"] for v in VILLAGES]

# In-memory storage for readings (cache)
class DataStore:
    def __init__(self):
        self.readings = {}  # village_name -> latest reading
        self.reading_history = defaultdict(list)  # village_name -> list of readings
        self.alerts = []  # Store alerts in memory as backup
        self.last_cleanup = datetime.now()
        self.lock = threading.Lock()
        self.last_update = datetime.now()
    
    def update_reading(self, village_name, reading):
        with self.lock:
            self.readings[village_name] = reading
            self.reading_history[village_name].append(reading)
            self.last_update = datetime.now()
            
            # Keep only last 10 readings (for charts)
            if len(self.reading_history[village_name]) > 10:
                self.reading_history[village_name] = self.reading_history[village_name][-10:]
    
    def get_latest(self, village_name):
        with self.lock:
            return self.readings.get(village_name)
    
    def get_all_latest(self):
        with self.lock:
            return list(self.readings.values())
    
    def get_history(self, village_name):
        with self.lock:
            return self.reading_history.get(village_name, [])
    
    def add_alert(self, alert):
        with self.lock:
            self.alerts.insert(0, alert)
            if len(self.alerts) > 100:
                self.alerts = self.alerts[:100]
    
    def get_alerts(self, limit=50):
        with self.lock:
            return self.alerts[:limit]
    
    def clear_alerts(self):
        with self.lock:
            self.alerts = []
            print("🧹 Cleared all alerts from memory")
    
    def clear_old_data(self):
        with self.lock:
            cutoff = datetime.now() - timedelta(minutes=10)
            for village in self.reading_history:
                self.reading_history[village] = [
                    r for r in self.reading_history[village]
                    if datetime.fromisoformat(r['timestamp']) > cutoff
                ]
            self.last_cleanup = datetime.now()
            print(f"🧹 Cleaned up data older than 10 minutes")

# Initialize data store
data_store = DataStore()

# AI Rule Engine
class WaterQualityEngine:
    @staticmethod
    def classify(ph, tds, turbidity, temp, village_name):
        # Safe ranges
        ph_safe = (6.5 <= ph <= 8.5)
        tds_safe = (0 <= tds <= 500)
        turbidity_safe = (0 <= turbidity <= 5)
        temp_safe = (20 <= temp <= 35)
        
        # Special conditions for demo
        if village_name == "Kondampatti":
            if random.random() < 0.7:
                return "Warning", random.randint(41, 70)
        elif village_name == "Puluthikarai":
            if random.random() < 0.7:
                return "Dangerous", random.randint(71, 100)
        
        # Count violations
        violations = 0
        if not ph_safe:
            violations += 1
        if not tds_safe:
            violations += 1
        if not turbidity_safe:
            violations += 1
        if not temp_safe:
            violations += 1
        
        # Determine status
        if violations == 0:
            status = "Safe"
            risk_score = random.randint(0, 40)
        elif violations == 1:
            status = "Warning"
            risk_score = random.randint(41, 70)
        else:
            status = "Dangerous"
            risk_score = random.randint(71, 100)
        
        return status, risk_score

# MongoDB Helper Functions
def store_reading_in_mongodb(reading):
    """Store reading in MongoDB - overwrites existing"""
    if not mongodb_initialized or readings_collection is None:
        return False
    
    try:
        # Delete existing reading for this village
        readings_collection.delete_one({"village_name": reading['village_name']})
        # Insert new reading
        readings_collection.insert_one(reading)
        return True
    except Exception as e:
        print(f"⚠️ MongoDB reading storage error: {e}")
        return False

def store_alert_in_mongodb(alert):
    """Store alert in MongoDB"""
    if not mongodb_initialized or alerts_collection  is None:
        data_store.add_alert(alert)
        return False
    
    try:
        alerts_collection.insert_one(alert)
        print(f"✅ Alert stored in MongoDB: {alert['message']}")
        return True
    except Exception as e:
        print(f"⚠️ MongoDB alert storage error: {e}")
        data_store.add_alert(alert)
        return False

def get_reading_from_mongodb(village_name):
    """Get latest reading from MongoDB"""
    if not mongodb_initialized or readings_collection is None:
        return None
    
    try:
        doc = readings_collection.find_one({"village_name": village_name})
        if doc:
            # Remove _id for JSON serialization
            doc.pop('_id', None)
            return doc
        return None
    except Exception as e:
        print(f"⚠️ MongoDB reading fetch error: {e}")
        return None

def get_all_readings_from_mongodb():
    """Get all readings from MongoDB"""
    if not mongodb_initialized or readings_collection is None:
        return []
    
    try:
        docs = readings_collection.find()
        readings = []
        for doc in docs:
            doc.pop('_id', None)
            readings.append(doc)
        return readings
    except Exception as e:
        print(f"⚠️ MongoDB readings fetch error: {e}")
        return []

def get_alerts_from_mongodb(limit=50):
    """Get alerts from MongoDB"""
    if not mongodb_initialized or alerts_collection is None:
        return []
    
    try:
        docs = alerts_collection.find().sort("timestamp", -1).limit(limit)
        result = []
        for doc in docs:
            doc.pop('_id', None)
            result.append(doc)
        return result
    except Exception as e:
        print(f"⚠️ MongoDB alerts fetch error: {e}")
        return []

def clear_old_alerts_from_mongodb():
    """Delete ALL alerts from MongoDB"""
    if not mongodb_initialized or alerts_collection is None:
        return False
    
    try:
        result = alerts_collection.delete_many({})
        print(f"🧹 Deleted {result.deleted_count} old alerts from MongoDB")
        return True
    except Exception as e:
        print(f"⚠️ Error clearing alerts from MongoDB: {e}")
        return False

# Cleanup service (runs every 10 minutes)
def cleanup_service():
    """Run cleanup every 10 minutes"""
    while True:
        try:
            time.sleep(600)  # 10 minutes
            data_store.clear_old_data()
            print(f"⏰ Cleanup completed at {datetime.now()}")
        except Exception as e:
            print(f"❌ Cleanup error: {e}")

# Start cleanup service in background
cleanup_thread = threading.Thread(target=cleanup_service, daemon=True)
cleanup_thread.start()

# API Endpoints

@app.get("/")
async def root():
    return {
        "message": "AquaAlert AI API", 
        "status": "running", 
        "mongodb": mongodb_initialized,
        "villages_count": len(VILLAGES),
        "readings_count": len(data_store.readings),
        "alerts_count": len(data_store.alerts)
    }

@app.get("/villages")
async def get_villages():
    """Get all villages with coordinates"""
    return {"villages": VILLAGES}

@app.get("/dashboard-summary")
async def get_dashboard_summary():
    """Get dashboard summary statistics"""
    try:
        # Get readings from MongoDB
        readings = get_all_readings_from_mongodb()
        
        if not readings:
            readings = data_store.get_all_latest()
        
        safe_count = sum(1 for r in readings if r.get('status') == 'Safe')
        warning_count = sum(1 for r in readings if r.get('status') == 'Warning')
        dangerous_count = sum(1 for r in readings if r.get('status') == 'Dangerous')
        
        # Get active alerts count
        active_alerts = 0
        
        if mongodb_initialized and alerts_collection is not None:
            try:
                alerts = get_alerts_from_mongodb(100)
                cutoff = datetime.now() - timedelta(hours=6)
                for alert in alerts:
                    if 'timestamp' in alert:
                        try:
                            alert_time = datetime.fromisoformat(alert['timestamp'])
                            if alert_time > cutoff:
                                active_alerts += 1
                        except:
                            pass
                print(f"📊 Active alerts from MongoDB: {active_alerts}")
            except Exception as e:
                print(f"⚠️ MongoDB alert count error: {e}")
                active_alerts = len(data_store.get_alerts())
        else:
            active_alerts = len(data_store.get_alerts())
        
        return {
            "total_villages": len(VILLAGES),
            "safe_villages": safe_count,
            "warning_villages": warning_count,
            "dangerous_villages": dangerous_count,
            "active_alerts": active_alerts,
            "last_updated": datetime.now().isoformat()
        }
    except Exception as e:
        print(f"❌ Dashboard summary error: {e}")
        return {
            "total_villages": len(VILLAGES),
            "safe_villages": 0,
            "warning_villages": 0,
            "dangerous_villages": 0,
            "active_alerts": 0,
            "last_updated": datetime.now(ZoneInfo("Asia/Kolkata")).isoformat()
        }

@app.get("/latest-readings")
async def get_latest_readings():
    """Get latest reading for all villages"""
    try:
        # Try MongoDB first
        readings = get_all_readings_from_mongodb()
        
        if not readings:
            readings = data_store.get_all_latest()
        
        return {"readings": readings, "count": len(readings)}
    except Exception as e:
        print(f"❌ Latest readings error: {e}")
        return {"readings": [], "count": 0}

@app.get("/alerts")
async def get_alerts(limit: int = 50):
    """Get recent alerts - tries MongoDB first, falls back to memory"""
    try:
        # Try MongoDB first
        alerts = get_alerts_from_mongodb(limit)
        
        if alerts:
            print(f"📊 Returning {len(alerts)} alerts from MongoDB")
            return {"alerts": alerts}
        
        # Fallback to memory
        memory_alerts = data_store.get_alerts(limit)
        print(f"📊 Returning {len(memory_alerts)} alerts from memory")
        return {"alerts": memory_alerts}
        
    except Exception as e:
        print(f"❌ Alerts error: {e}")
        return {"alerts": []}

@app.get("/village/{village_name}")
async def get_village_data(village_name: str):
    """Get latest data for a specific village"""
    try:
        # Try MongoDB first
        reading = get_reading_from_mongodb(village_name)
        
        if not reading:
            reading = data_store.get_latest(village_name)
        
        if not reading:
            raise HTTPException(status_code=404, detail="Village not found")
        return reading
    except HTTPException:
        raise
    except Exception as e:
        print(f"❌ Village data error: {e}")
        raise HTTPException(status_code=500, detail=str(e))

@app.get("/history/{village_name}")
async def get_village_history(village_name: str):
    """Get historical data for a village"""
    try:
        history = data_store.get_history(village_name)
        return {"history": history}
    except Exception as e:
        print(f"❌ History error: {e}")
        return {"history": []}

@app.post("/simulate/reading")
async def simulate_reading(village_name: str):
    """Manually trigger a simulation reading"""
    try:
        from simulation import generate_reading, store_reading
        reading = generate_reading(village_name)
        success = store_reading(reading, data_store)
        if success:
            return {"message": "Reading generated", "reading": reading}
        else:
            raise HTTPException(status_code=500, detail="Failed to generate reading")
    except Exception as e:
        print(f"❌ Simulation error: {e}")
        raise HTTPException(status_code=500, detail=str(e))

if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="0.0.0.0", port=8000)

import threading
from simulation import run_simulation

threading.Thread(
    target=run_simulation,
    daemon=True
).start()