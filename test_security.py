import os
import sys
import json
import time

sys.path.insert(0, os.path.dirname(__file__))

from app import app, init_db
from game.db import get_game

init_db()
client = app.test_client()

def run_tests():
    print("Starting tests...")
    
    # Login
    res = client.post('/api/login', json={'username': 'hacker'})
    assert res.status_code == 200
    
    # Start game
    res = client.post('/api/start')
    assert res.status_code == 200
    data = res.get_json()
    state = data['state']
    
    current_room = state['current_room']
    print(f"Started in room {current_room}")
    
    # Verify hidden positions
    assert state['pos_diccionario'] is None or state['pos_diccionario']['room'] == current_room
    assert state['pos_papiro1'] is None or state['pos_papiro1']['room'] == current_room
    assert state['pos_papiro2'] is None or state['pos_papiro2']['room'] == current_room
    print("✓ Items are hidden when not in the same room")
    
    # Test illegal move
    target_illegal = 5 if current_room == 1 else 1
    res = client.post('/api/move', json={'room': target_illegal})
    assert res.status_code == 400
    assert res.get_json()['error'] == 'No puedes saltar a esa sala'
    print(f"✓ Illegal move to {target_illegal} was blocked")
    
    # Test legal move
    target_legal = current_room + 1 if current_room < 5 else current_room - 1
    res = client.post('/api/move', json={'room': target_legal})
    assert res.status_code == 200
    state = res.get_json()['state']
    assert state['current_room'] == target_legal
    print(f"✓ Legal move to {target_legal} was allowed")
    
    # Verify items in new room
    if state['pos_diccionario'] is not None:
        assert state['pos_diccionario']['room'] == target_legal
        
    print("All security tests passed!")

if __name__ == '__main__':
    run_tests()
