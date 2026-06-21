import random
from datetime import datetime
import time
import os
from dotenv import load_dotenv
from pymongo import MongoClient
from zoneinfo import ZoneInfo

# Load environment variables
load_dotenv()

# Initialize MongoDB
mongodb_initialized = False
db = None
readings_collection = None
alerts_collection = None

try:
    mongodb_uri = os.getenv('MONGODB_URI')
    
    if mongodb_uri:
        client = MongoClient(mongodb_uri)
        db_name = os.getenv('MONGODB_DATABASE', 'aquaalert')
        db = client[db_name]
        readings_collection = db['water_readings']
        alerts_collection = db['alerts']
        mongodb_initialized = True
        print("✅ MongoDB initialized successfully")
    else:
        print(f"❌ MongoDB URI not found")
except Exception as e:
    print(f"❌ MongoDB initialization error: {e}")
    mongodb_initialized = False

# Villages
VILLAGES = [
    "Adagappadi", "Akkamanahalli", "Aandihalli", "A.Gollahalli",
    "HaleDharmapuri", "Kadagathur", "Kondampatti", "Kondagarahalli",
    "Konanginaickanahalli", "Koduhalli", "Krishnapuram", "Kuppur",
    "Lakkiyampatti", "Mookanur", "Naickanahalli", "K.Naduhalli",
    "Nallasenahalli", "Noolahalli", "Puluthikarai", "Semmandakuppam",
    "Settikarai", "Sogathur", "Thippireddihalli", "Unguranahalli",
    "Vellalapatti", "Vellolai", "V.Muthampatti", "Mukkalnaickanpatti"
]

# Try to import data store from main
try:
    import main
    data_store = main.data_store
    print("✅ Using data_store from main.py")
except (ImportError, AttributeError):
    from collections import defaultdict
    import threading
    
    class DataStore:
        def __init__(self):
            self.readings = {}
            self.reading_history = defaultdict(list)
            self.alerts = []
            self.lock = threading.Lock()
            self.last_update = datetime.now()
        
        def update_reading(self, village_name, reading):
            with self.lock:
                self.readings[village_name] = reading
                self.reading_history[village_name].append(reading)
                self.last_update = datetime.now()
                if len(self.reading_history[village_name]) > 10:
                    self.reading_history[village_name] = self.reading_history[village_name][-10:]
        
        def get_latest(self, village_name):
            with self.lock:
                return self.readings.get(village_name)
        
        def get_all_latest(self):
            with self.lock:
                return list(self.readings.values())
        
        def add_alert(self, alert):
            with self.lock:
                self.alerts.insert(0, alert)
                if len(self.alerts) > 100:
                    self.alerts = self.alerts[:100]
        
        def clear_alerts(self):
            with self.lock:
                self.alerts = []
                print("🧹 Cleared all alerts from memory")
    
    data_store = DataStore()
    print("✅ Created standalone data_store")

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

def generate_reading(village_name):
    """Generate realistic water quality data"""
    
    # Base values (normal range)
    base_ph = 7.0
    base_tds = 250
    base_turbidity = 2.5
    base_temp = 27.5
    
    # Add some randomness
    ph = base_ph + random.uniform(-1.5, 1.5)
    
    # Special conditions for demo villages
    if village_name == "Kondampatti":
        ph = base_ph + random.uniform(0.5, 2.0)
    elif village_name == "Puluthikarai":
        ph = base_ph + random.uniform(-1.0, 1.0)
        base_tds = 500 + random.uniform(0, 300)
        base_turbidity = 5 + random.uniform(0, 5)
    
    tds = base_tds + random.uniform(-150, 150)
    turbidity = base_turbidity + random.uniform(-1.5, 1.5)
    temperature = base_temp + random.uniform(-3, 3)
    
    # Ensure values stay within reasonable bounds
    ph = max(4.0, min(10.0, ph))
    tds = max(0, min(1000, tds))
    turbidity = max(0, min(15, turbidity))
    temperature = max(15, min(40, temperature))
    
    # AI Classification
    status, risk_score = classify_water(ph, tds, turbidity, temperature, village_name)
    
    return {
        "village_name": village_name,
        "ph": round(ph, 2),
        "tds": round(tds, 1),
        "turbidity": round(turbidity, 2),
        "temperature": round(temperature, 1),
        "risk_score": risk_score,
        "status": status,
        "timestamp": datetime.now(ZoneInfo("Asia/Kolkata")).isoformat()
    }

def classify_water(ph, tds, turbidity, temp, village_name):
    """Rule-based AI classification engine"""
    
    # Safe ranges
    ph_safe = (6.5 <= ph <= 8.5)
    tds_safe = (0 <= tds <= 500)
    turbidity_safe = (0 <= turbidity <= 5)
    temp_safe = (20 <= temp <= 35)
    
    # Special conditions for demo
    if village_name == "Kondampatti":
        if random.random() < 0.7:
            return "Warning", random.randint(41, 70)
    
    if village_name == "Puluthikarai":
        if random.random() < 0.8:
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

def store_alert_in_mongodb(village_name, message, status):
    """Store alert in MongoDB and memory"""
    alert = {
        "village_name": village_name,
        "message": message,
        "status": status,
        "timestamp": datetime.now(ZoneInfo("Asia/Kolkata")).isoformat(),
        "read": False
    }
    
    # Store in memory
    data_store.add_alert(alert)
    
    # Store in MongoDB
    if mongodb_initialized and alerts_collection is not None:
        try:
            alerts_collection.insert_one(alert)
            print(f"🚨 ALERT stored in MongoDB: {message}")
            return True
        except Exception as e:
            print(f"⚠️ Could not store alert in MongoDB: {e}")
            return True
    else:
        return True

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

def store_reading(reading):
    """Store reading in memory AND MongoDB"""
    try:
        # Store in memory
        data_store.update_reading(reading['village_name'], reading)
        
        # Store in MongoDB (overwrites old data)
        store_reading_in_mongodb(reading)
        
        return True
    except Exception as e:
        print(f"❌ Error storing reading: {e}")
        return False

def generate_and_store_alerts():
    """Generate alerts based on current readings"""
    alert_count = 0
    readings = data_store.get_all_latest()
    
    for reading in readings:
        # Always generate alert for Dangerous status
        if reading['status'] == 'Dangerous':
            message = f"DANGER: {reading['village_name']} contamination risk detected!"
            store_alert_in_mongodb(reading['village_name'], message, reading['status'])
            alert_count += 1
        # Generate warning for Warning status
        elif reading['status'] == 'Warning':
            message = f"WARNING: {reading['village_name']} water quality is deteriorating."
            store_alert_in_mongodb(reading['village_name'], message, reading['status'])
            alert_count += 1
    
    return alert_count

def run_simulation():
    """Main simulation loop - runs every 10 minutes"""
    print("🚀 Starting AquaAlert AI Simulation...")
    print(f"Monitoring {len(VILLAGES)} villages in Dharmapuri district")
    print(f"📊 Data stored in MongoDB (overwritten every 10 minutes)")
    print(f"🚨 Alerts cleared and regenerated every 10 minutes")
    print("🔄 New readings generated every 10 minutes")
    print("=" * 50)
    
    # Store initial readings immediately
    print("📊 Generating initial readings...")
    for village in VILLAGES:
        reading = generate_reading(village)
        store_reading(reading)
        print(f"✓ {village}: {reading['status']} (Risk: {reading['risk_score']})")
    
    # Generate initial alerts
    print("\n📢 Generating initial alerts...")
    alert_count = generate_and_store_alerts()
    print(f"📊 Generated {alert_count} alerts")
    
    print("=" * 50)
    print("🔄 Simulation running... Press Ctrl+C to stop")
    print("⏰ Next update in 10 minutes...")
    
    # Main loop - runs every 10 minutes
    while True:
        try:
            # Wait 10 minutes with progress indicator
            for i in range(10, 0, -1):
                print(f"⏳ Next update in {i} minute{'s' if i > 1 else ''}...")
                time.sleep(60)
            
            print(f"\n📊 Generating new readings at {datetime.now().strftime('%H:%M:%S')}")
            
            # Clear old alerts
            print("🧹 Clearing old alerts...")
            data_store.clear_alerts()
            clear_old_alerts_from_mongodb()
            
            # Update all villages with new readings
            for village in VILLAGES:
                reading = generate_reading(village)
                store_reading(reading)
                print(f"✓ {village}: {reading['status']} (Risk: {reading['risk_score']})")
            
            # Generate new alerts based on current readings
            print("\n📢 Generating new alerts...")
            alert_count = generate_and_store_alerts()
            print(f"📊 Generated {alert_count} alerts")
            
            print("-" * 50)
            print("⏰ Next update in 10 minutes...")
            
        except KeyboardInterrupt:
            print("\n🛑 Simulation stopped")
            break
        except Exception as e:
            print(f"❌ Error: {e}")
            time.sleep(60)

if __name__ == "__main__":
    run_simulation()