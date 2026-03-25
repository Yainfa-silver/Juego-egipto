import os
import sys
import json

sys.path.insert(0, os.path.dirname(__file__))

from app import app, init_db

init_db()
client = app.test_client()

def test_username_length():
    print("Testing username length validation...")
    
    # Test valid username (9 characters)
    res = client.post('/api/login', json={'username': '123456789'})
    assert res.status_code == 200
    print("✓ Valid username (9 chars) allowed")

    # Test valid username (under 9 characters)
    res = client.post('/api/login', json={'username': 'pablo'})
    assert res.status_code == 200
    print("✓ Valid username (5 chars) allowed")
    
    # Test invalid username (10 characters)
    res = client.post('/api/login', json={'username': '1234567890'})
    # This should fail after implementation
    if res.status_code == 400:
        print("✓ Invalid username (10 chars) blocked as expected")
    else:
        print("✗ Invalid username (10 chars) was NOT blocked (Expected if not yet implemented)")

    # Test invalid username (very long)
    res = client.post('/api/login', json={'username': 'this_is_a_very_long_username'})
    if res.status_code == 400:
        print("✓ Very long username blocked as expected")
    else:
        print("✗ Very long username was NOT blocked (Expected if not yet implemented)")

if __name__ == '__main__':
    test_username_length()
