import sqlite3
import os
import json
import time as t

DB_PATH = os.path.join(os.path.dirname(os.path.dirname(__file__)), 'data', 'game.db')


def get_db():
    conn = sqlite3.connect(DB_PATH)
    conn.row_factory = sqlite3.Row
    return conn


def init_db():
    os.makedirs(os.path.dirname(DB_PATH), exist_ok=True)
    conn = get_db()
    c = conn.cursor()
    c.execute('''
        CREATE TABLE IF NOT EXISTS users (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            username TEXT UNIQUE NOT NULL,
            achievements TEXT DEFAULT '[]'
        )
    ''')
    c.execute('''
        CREATE TABLE IF NOT EXISTS game_state (
            id                    INTEGER PRIMARY KEY AUTOINCREMENT,
            user_id               INTEGER,
            variant               INTEGER NOT NULL,
            current_room          INTEGER DEFAULT 1,
            buttons_activated     TEXT    DEFAULT '[]',
            has_dictionary        INTEGER DEFAULT 0,
            has_papiro1           INTEGER DEFAULT 0,
            has_papiro2           INTEGER DEFAULT 0,
            puzzle_pieces         TEXT    DEFAULT '[]',
            pos_diccionario       TEXT,
            pos_papiro1           TEXT,
            pos_papiro2           TEXT,
            enigma1_solved        INTEGER DEFAULT 0,
            enigma2_solved        INTEGER DEFAULT 0,
            hidden_button_pressed INTEGER DEFAULT 0,
            puzzle_completed      INTEGER DEFAULT 0,
            start_time            REAL,
            game_won              INTEGER DEFAULT 0,
            game_over             INTEGER DEFAULT 0,
            end_time              REAL,
            difficulty            TEXT    DEFAULT 'easy',
            total_time            REAL    DEFAULT 900.0,
            has_torch             INTEGER DEFAULT 0,
            error_count           INTEGER DEFAULT 0,
            notes_read            TEXT    DEFAULT '[]',
            weights_collected     TEXT    DEFAULT '[]',
            anubis_solved         INTEGER DEFAULT 0,
            pos_weights           TEXT,
            e1_code               TEXT,
            e2_code               TEXT,
            secret_text           TEXT,
            has_secret_relic      INTEGER DEFAULT 0,
            has_palo              INTEGER DEFAULT 0,
            has_vendas            INTEGER DEFAULT 0
        )
    ''')
    
    alters = [
        "ALTER TABLE game_state ADD COLUMN end_time REAL",
        "ALTER TABLE game_state ADD COLUMN difficulty TEXT DEFAULT 'easy'",
        "ALTER TABLE game_state ADD COLUMN total_time REAL DEFAULT 900.0",
        "ALTER TABLE game_state ADD COLUMN has_torch INTEGER DEFAULT 0",
        "ALTER TABLE game_state ADD COLUMN error_count INTEGER DEFAULT 0",
        "ALTER TABLE game_state ADD COLUMN notes_read TEXT DEFAULT '[]'",
        "ALTER TABLE game_state ADD COLUMN weights_collected TEXT DEFAULT '[]'",
        "ALTER TABLE game_state ADD COLUMN anubis_solved INTEGER DEFAULT 0",
        "ALTER TABLE game_state ADD COLUMN pos_weights TEXT",
        "ALTER TABLE users ADD COLUMN achievements TEXT DEFAULT '[]'",
        "ALTER TABLE game_state ADD COLUMN e1_code TEXT",
        "ALTER TABLE game_state ADD COLUMN e2_code TEXT",
        "ALTER TABLE game_state ADD COLUMN secret_text TEXT",
        "ALTER TABLE game_state ADD COLUMN has_secret_relic INTEGER DEFAULT 0",
        "ALTER TABLE game_state ADD COLUMN has_palo INTEGER DEFAULT 0",
        "ALTER TABLE game_state ADD COLUMN has_vendas INTEGER DEFAULT 0"
    ]
    for q in alters:
        try:
            c.execute(q)
        except sqlite3.OperationalError:
            pass # Column already exists
    conn.commit()
    conn.close()


def get_or_create_user(username):
    conn = get_db()
    c = conn.cursor()
    c.execute('SELECT id FROM users WHERE username = ?', (username,))
    row = c.fetchone()
    if row:
        user_id = row['id']
        conn.close()
        return user_id
    else:
        if len(username) > 9:
            conn.close()
            raise ValueError("Username too long (max 9 characters)")
        c.execute('INSERT INTO users (username) VALUES (?)', (username,))
        user_id = c.lastrowid
        conn.commit()
        conn.close()
        return user_id

def abandon_games_for_user(user_id):
    conn = get_db()
    c = conn.cursor()
    c.execute(
        'UPDATE game_state SET game_over = 1 WHERE user_id = ? AND game_won = 0 AND game_over = 0',
        (user_id,)
    )
    conn.commit()

def get_active_game_for_user(user_id, time_now):
    # Returns the incomplete game if there is time remaining and game is not won or over
    conn = get_db()
    c = conn.cursor()
    # Let logic module's GAME_DURATION be checked remotely, we just fetch the latest incomplete
    c.execute('''
        SELECT * FROM game_state 
        WHERE user_id = ? AND game_won = 0 AND game_over = 0
        ORDER BY id DESC LIMIT 1
    ''', (user_id,))
    row = c.fetchone()
    conn.close()
    return dict(row) if row else None


def create_game(e1_code, e2_code, secret_text, p_dic, p_pap1, p_pap2, p_weight, user_id=None, difficulty='easy', total_time=900.0):
    conn = get_db()
    c = conn.cursor()
    c.execute(
        '''INSERT INTO game_state 
           (user_id, variant, start_time, pos_diccionario, pos_papiro1, pos_papiro2, pos_weights, difficulty, total_time, e1_code, e2_code, secret_text) 
           VALUES (?, 0, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)''',
        (user_id, t.time(), p_dic, p_pap1, p_pap2, p_weight, difficulty, total_time, json.dumps(e1_code), json.dumps(e2_code), secret_text)
    )
    game_id = c.lastrowid
    conn.commit()
    conn.close()
    return game_id


def get_game(game_id):
    conn = get_db()
    c = conn.cursor()
    c.execute('SELECT * FROM game_state WHERE id = ?', (game_id,))
    row = c.fetchone()
    conn.close()
    return dict(row) if row else None


def update_game(game_id, **kwargs):
    if not kwargs:
        return
    conn = get_db()
    c = conn.cursor()
    set_clause = ', '.join(f'{k} = ?' for k in kwargs)
    values = list(kwargs.values()) + [game_id]
    c.execute(f'UPDATE game_state SET {set_clause} WHERE id = ?', values)
    conn.commit()
    conn.close()
