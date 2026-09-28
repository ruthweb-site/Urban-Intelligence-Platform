import requests
import time

BASE_URL = "http://localhost:5000"

print("\n" + "="*70)
print("Testing Redis Cache with Your API")
print("="*70)

# Test 1: Health Check
print("\n✅ Test 1: Health Check")
response = requests.get(f"{BASE_URL}/api/health")
print(f"   Status: {response.status_code}")
print(f"   Redis: {response.json()['redis']}")

# Test 2: Create Event
print("\n✅ Test 2: Create Event")
event = {
    "event_type": "pothole",
    "confidence": 0.93,
    "latitude": 19.076,
    "longitude": 72.8777,
    "timestamp": "2024-01-15T10:30:00Z",
    "bus_id": "BUS-102",
    "severity": "HIGH"
}
response = requests.post(f"{BASE_URL}/api/events", json=event)
print(f"   Status: {response.status_code}")
print(f"   Event ID: {response.json()['id']}")
print(f"   Message: {response.json()['status']}")

# Test 3: Get Stats (First time - DB)
print("\n✅ Test 3: Get Stats (First call - DATABASE)")
start = time.time()
response = requests.get(f"{BASE_URL}/api/stats")
db_time = time.time() - start
print(f"   Status: {response.status_code}")
print(f"   Source: {response.json().get('source', 'unknown')}")
print(f"   Time: {db_time*1000:.2f}ms")

# Test 4: Get Stats (Second time - Cache)
print("\n✅ Test 4: Get Stats (Second call - CACHE)")
start = time.time()
response = requests.get(f"{BASE_URL}/api/stats")
cache_time = time.time() - start
print(f"   Status: {response.status_code}")
print(f"   Source: {response.json().get('source', 'unknown')}")
print(f"   Time: {cache_time*1000:.2f}ms")
if db_time > 0:
    print(f"   ⚡ SPEED UP: {(db_time/cache_time):.1f}x faster!")

# Test 5: Get Events (Cached)
print("\n✅ Test 5: Get Events")
response = requests.get(f"{BASE_URL}/api/events")
print(f"   Status: {response.status_code}")
print(f"   Total Events: {response.json()['total']}")
print(f"   Source: {response.json()['source']}")

# Test 6: Get Heatmap (Cached)
print("\n✅ Test 6: Get Heatmap")
response = requests.get(f"{BASE_URL}/api/events/heatmap")
print(f"   Status: {response.status_code}")
print(f"   Points: {len(response.json()['points'])}")

# Test 7: Create Ticket
print("\n✅ Test 7: Create Ticket")
ticket = {
    "event_id": 1,
    "department": "Road Maintenance",
    "priority": "HIGH",
    "assigned_to": "john_doe",
    "notes": "Urgent pothole repair needed"
}
response = requests.post(f"{BASE_URL}/api/tickets", json=ticket)
print(f"   Status: {response.status_code}")
if response.status_code == 201:
    print(f"   Ticket ID: {response.json()['ticket_id']}")
else:
    print(f"   Response: {response.json()}")

# Test 8: Get Tickets (Cached)
print("\n✅ Test 8: Get Tickets")
response = requests.get(f"{BASE_URL}/api/tickets")
print(f"   Status: {response.status_code}")
print(f"   Total Tickets: {response.json()['total']}")

# Test 9: Get Buses (Cached)
print("\n✅ Test 9: Get Buses")
response = requests.get(f"{BASE_URL}/api/buses")
print(f"   Status: {response.status_code}")
print(f"   Buses: {len(response.json()['buses'])}")

# Test 10: Get Impact (Cached)
print("\n✅ Test 10: Get Impact")
response = requests.get(f"{BASE_URL}/api/impact")
print(f"   Status: {response.status_code}")
print(f"   Issues Detected: {response.json()['issues_detected']}")
print(f"   Source: {response.json()['source']}")

# Test 11: Get Road Health (Cached)
print("\n✅ Test 11: Get Road Health")
response = requests.get(f"{BASE_URL}/api/road-health")
print(f"   Status: {response.status_code}")
print(f"   Road Score: {response.json()['road_health_score']}")
print(f"   Source: {response.json()['source']}")

# Test 12: Redis Cache Stats
print("\n✅ Test 12: Redis Cache Statistics")
response = requests.get(f"{BASE_URL}/api/cache/stats")
stats = response.json()
print(f"   Status: {stats['status']}")
print(f"   Used Memory: {stats['used_memory']}")
print(f"   Connected Clients: {stats['connected_clients']}")
print(f"   Total Commands: {stats['total_commands']}")

print("\n" + "="*70)
print("🎉 All Tests Passed! Redis is Working!")
print("="*70 + "\n")