import json
import os
import sys

from flask import Flask, render_template, request, jsonify, session

sys.path.insert(0, os.path.dirname(__file__))

from game.db import (
    init_db, create_game, get_game, update_game,
    get_or_create_user, get_active_game_for_user, abandon_games_for_user
)
from game.logic import (
    validate_enigma, get_time_remaining, is_time_up,
    generate_random_codes, random_positions, HIEROGLYPHS, HIEROGLYPH_NAMES,
    get_hints, get_papiro_indices,
)

app = Flask(__name__)
app.secret_key = 'egypt_pyramid_secret_2024_xK9mZ'

# ═══════════════════════════════════════════
#  Helper: build JSON state sent to client
# ═══════════════════════════════════════════

def _build_state(game):
    e1_code = json.loads(game['e1_code'])
    e2_code = json.loads(game['e2_code'])
    time_remaining = get_time_remaining(game)

    # Mark game over if timer expired
    if time_remaining <= 0 and not game['game_won'] and not game['game_over']:
        update_game(game['id'], game_over=1)
        game['game_over'] = 1

    hint1, hint2 = get_hints(
        e1_code, e2_code, game['has_papiro1'], game['has_papiro2'], game['has_dictionary']
    )
    idx1, idx2 = get_papiro_indices(e1_code, e2_code, game['has_papiro1'], game['has_papiro2'])

    pos_dic = json.loads(game['pos_diccionario']) if game['pos_diccionario'] else None
    pos_pap1 = json.loads(game['pos_papiro1']) if game['pos_papiro1'] else None
    pos_pap2 = json.loads(game['pos_papiro2']) if game['pos_papiro2'] else None
    pos_weights = json.loads(game.get('pos_weights', '[]')) if game.get('pos_weights') else []
    notes = json.loads(game.get('notes', '{}'))
    
    current = game['current_room']
    client_pos_dic = pos_dic if pos_dic and pos_dic['room'] == current else None
    client_pos_pap1 = pos_pap1 if pos_pap1 and pos_pap1['room'] == current else None
    client_pos_pap2 = pos_pap2 if pos_pap2 and pos_pap2['room'] == current else None
    client_pos_weights = [w for w in pos_weights if w.get('room') == current]

    return {
        'game_id':               game['id'],
        'current_room':          game['current_room'],
        'has_dictionary':        bool(game['has_dictionary']),
        'has_papiro1':           bool(game['has_papiro1']),
        'has_papiro2':           bool(game['has_papiro2']),
        'puzzle_pieces':         json.loads(game['puzzle_pieces']),
        'enigma1_solved':        bool(game['enigma1_solved']),
        'enigma2_solved':        bool(game['enigma2_solved']),
        'anubis_solved':         bool(game.get('anubis_solved', 0)),
        'hidden_button_pressed': bool(game['hidden_button_pressed']),
        'puzzle_completed':      bool(game['puzzle_completed']),
        'buttons_activated':     json.loads(game['buttons_activated']),
        'game_won':              bool(game['game_won']),
        'game_over':             bool(game['game_over']),
        'time_remaining':        time_remaining,
        
        'pos_diccionario':       client_pos_dic,
        'pos_papiro1':           client_pos_pap1,
        'pos_papiro2':           client_pos_pap2,
        'pos_weights':           client_pos_weights,
        
        'difficulty':            game.get('difficulty', 'easy'),
        'has_torch':             bool(game.get('has_torch', 0)),
        'notes_read':            json.loads(game.get('notes_read', '[]')),
        'weights_collected':     json.loads(game.get('weights_collected', '[]')),
        'error_count':           game.get('error_count', 0),
        'has_secret_relic':      bool(game.get('has_secret_relic', 0)),
        'has_palo':              bool(game.get('has_palo', 0)),
        'has_vendas':            bool(game.get('has_vendas', 0)),
        'notes':                 notes,
        
        'hieroglyphs':           HIEROGLYPHS,
        'hieroglyph_names':      HIEROGLYPH_NAMES,
        'enigma1_hint':          hint1,
        'enigma2_hint':          hint2,
        'papiro1_code_indices':  idx1,
        'papiro2_code_indices':  idx2,
        'secret_text':           game['secret_text'] if game['game_won'] else None,
    }


# ═══════════════════════════════════════════
#  Routes
# ═══════════════════════════════════════════

@app.route('/')
def index():
    return render_template('index.html')


@app.route('/api/login', methods=['POST'])
def login():
    data = request.get_json()
    username = data.get('username')
    if not username or not username.strip():
        return jsonify({'error': 'Nombre de usuario en blanco'}), 400
    
    if len(username.strip()) > 9:
        return jsonify({'error': 'El nombre de usuario no puede superar los 9 caracteres'}), 400
    
    user_id = get_or_create_user(username.strip())
    session['user_id'] = user_id
    
    import time
    active = get_active_game_for_user(user_id, time.time())
    has_active = False
    
    if active:
        if get_time_remaining(active) > 0:
            has_active = True
        else:
            update_game(active['id'], game_over=1)
            
    # Also fetch user's achievements
    from game.db import get_db
    conn = get_db()
    c = conn.cursor()
    c.execute('SELECT achievements FROM users WHERE id = ?', (user_id,))
    row = c.fetchone()
    achievements = json.loads(row['achievements'] if row and row['achievements'] else '[]')
    conn.close()

    return jsonify({
        'success': True,
        'username': username.strip(),
        'has_active_game': has_active,
        'achievements': achievements
    })

@app.route('/api/resume', methods=['POST'])
def resume_game():
    if 'user_id' not in session:
        return jsonify({'error': 'No logueado'}), 401
    import time
    active = get_active_game_for_user(session['user_id'], time.time())
    if active and get_time_remaining(active) > 0:
        session['game_id'] = active['id']
        return jsonify({'success': True, 'state': _build_state(active)})
    else:
        return jsonify({'error': 'No hay partida activa'}), 400

@app.route('/api/start', methods=['POST'])
def start_game():
    if 'user_id' not in session:
        return jsonify({'error': 'No logueado'}), 401
    
    user_id = session['user_id']
    abandon_games_for_user(user_id) 

    difficulty = request.json.get('difficulty', 'easy') if request.is_json and request.json else 'easy'
    total_time = 420.0 if difficulty == 'hard' else 900.0

    e1, e2, secret = generate_random_codes()
    p_dic, p_pap1, p_pap2, p_weight, notes_json = random_positions()
    game_id = create_game(e1, e2, secret, p_dic, p_pap1, p_pap2, p_weight, notes_json, user_id=user_id, difficulty=difficulty, total_time=total_time)
    
    session['game_id'] = game_id
    game = get_game(game_id)
    return jsonify({'success': True, 'state': _build_state(game)})


@app.route('/api/state', methods=['GET'])
def get_state():
    game_id = session.get('game_id')
    if not game_id:
        return jsonify({'error': 'Sin partida activa'}), 400
    game = get_game(game_id)
    if not game:
        return jsonify({'error': 'Partida no encontrada'}), 404
    return jsonify({'state': _build_state(game)})


@app.route('/api/move', methods=['POST'])
def move():
    game_id = session.get('game_id')
    game = get_game(game_id)
    if not game:
        return jsonify({'error': 'Sin partida'}), 400
    if is_time_up(game):
        return jsonify({'error': '¡Tiempo agotado!'}), 400
        
    data = request.get_json()
    room = data.get('room')
    if room not in [1, 2, 3, 4, 5, 6, 7]:
        return jsonify({'error': 'Sala inválida'}), 400
    if abs(game['current_room'] - room) != 1:
        return jsonify({'error': 'No puedes saltar a esa sala'}), 400
    # Condition: Rooms 4, 5, 6, 7 are dark; need torch to enter from below or if target is dark
    if room >= 4 and not game.get('has_torch'):
        return jsonify({'error': '⚠️ Está demasiado oscuro para avanzar. Necesitas una antorcha.'}), 400
    update_game(game_id, current_room=room)
    game = get_game(game_id)
    return jsonify({'success': True, 'state': _build_state(game)})

@app.route('/api/hint', methods=['POST'])
def trigger_hint():
    game_id = session.get('game_id')
    game = get_game(game_id)
    if not game:
        return jsonify({'error': 'Sin partida'}), 400
    if is_time_up(game):
        return jsonify({'error': '¡Tiempo agotado!'}), 400

    # Penalization: push start_time into the past by 120s
    new_start_time = game['start_time'] - 120.0
    update_game(game_id, start_time=new_start_time)
    game = get_game(game_id)

    msg = "Pista divina: Explora todas las salas prestando atención a los papiros."
    if not game['has_dictionary']:
        msg = "Pista divina: Debes encontrar el Diccionario de Jeroglíficos antes de intentar descifrar nada."
    elif not game['enigma1_solved']:
        e1 = json.loads(game['e1_code'])
        msg = f"La pared susurra: {HIEROGLYPH_NAMES[e1[0]]}..."
    elif not game['enigma2_solved']:
        e2 = json.loads(game['e2_code'])
        msg = f"La pared susurra la primera pieza: {HIEROGLYPH_NAMES[e2[0]]}..."
    elif not game['anubis_solved']:
        msg = "Pista divina: La Balanza de Anubis en la Sala 4 anhela equilibrio perfecto entre el corazón, pluma y el oro."

    return jsonify({'success': True, 'state': _build_state(game), 'message': f'⏳ Has sacrificado 2 minutos por esta pista. {msg}'})


@app.route('/api/pickup', methods=['POST'])
def pickup():
    game_id = session.get('game_id')
    game = get_game(game_id)
    if not game:
        return jsonify({'error': 'Sin partida'}), 400
    if is_time_up(game):
        return jsonify({'error': '¡Tiempo agotado!', 'game_over': True}), 400

    item = request.get_json().get('item')
    updates = {}
    message = ''

    dic_room = json.loads(game['pos_diccionario'])['room'] if game['pos_diccionario'] else -1
    p1_room  = json.loads(game['pos_papiro1'])['room'] if game['pos_papiro1'] else -1
    p2_room  = json.loads(game['pos_papiro2'])['room'] if game['pos_papiro2'] else -1

    if item == 'dictionary' and game['current_room'] == dic_room and not game['has_dictionary']:
        updates['has_dictionary'] = 1
        message = '📜 ¡Has recogido el Diccionario de Jeroglíficos!'
    elif item == 'papiro1' and game['current_room'] == p1_room and not game['has_papiro1']:
        updates['has_papiro1'] = 1
        message = '📄 ¡Has recogido el Papiro de Ra!'
    elif item == 'papiro2' and game['current_room'] == p2_room and not game['has_papiro2']:
        updates['has_papiro2'] = 1
        message = '📄 ¡Has recogido el Papiro de Osiris!'
    elif item == 'palo' and game['current_room'] == 1 and not game.get('has_palo'):
        updates['has_palo'] = 1
        message = '🪵 Has recogido un Palo Seco de madera antigua.'
    elif item == 'vendas' and game['current_room'] == 2 and not game.get('has_vendas'):
        updates['has_vendas'] = 1
        message = '🩹 Has recogido Vendas impregnadas en aceite reseco.'
    # Torch direct pickup removed, now uses crafting, but we keep the logical fallback just in case
    elif item == 'torch' and game['current_room'] == 1 and not game.get('has_torch'):
        return jsonify({'error': 'No puedes recoger la antorcha así, debes fabricarla.'}), 400
    else:
        return jsonify({'error': 'No puedes recoger ese objeto ahora'}), 400

    update_game(game_id, **updates)
    game = get_game(game_id)
    return jsonify({'success': True, 'message': message, 'state': _build_state(game)})


@app.route('/api/craft', methods=['POST'])
def craft():
    game_id = session.get('game_id')
    game = get_game(game_id)
    if not game: return jsonify({'error': 'Sin partida'}), 400
    
    data = request.get_json()
    item1 = data.get('item1')
    item2 = data.get('item2')
    
    items = {item1, item2}
    if items == {'palo', 'vendas'}:
        if not game.get('has_palo') or not game.get('has_vendas'):
            return jsonify({'error': 'No tienes los componentes.'}), 400
        # Consume palo & vendas, give torch
        update_game(game_id, has_palo=0, has_vendas=0, has_torch=1)
        game = get_game(game_id)
        return jsonify({'success': True, 'message': '🔥 Has combinado el Palo Seco y las Vendas para crear una Antorcha.', 'state': _build_state(game)})
    
    return jsonify({'error': 'No puedes combinar eso.'}), 400

@app.route('/api/unlock_secret', methods=['POST'])
def unlock_secret():
    game_id = session.get('game_id')
    game = get_game(game_id)
    if not game: return jsonify({'error': 'Sin partida'}), 400
    
    data = request.get_json()
    code = data.get('code')
    
    # Let's say the secret code is 3-1-4 (Pi)
    if code == '3-1-4':
        if not game.get('has_secret_relic'):
            update_game(game_id, has_secret_relic=1)
            game = get_game(game_id)
            return jsonify({'success': True, 'message': '🔓 ¡Click! Has desvelado el cofre oculto y obtenido la Reliquia de Kha-Ra.', 'state': _build_state(game)})
        else:
            return jsonify({'error': 'Ya tienes la reliquia.'}), 400
    else:
        # Increase error count for wrong cylinder attempts
        new_err = game.get('error_count', 0) + 1
        update_game(game_id, error_count=new_err)
        game = get_game(game_id)
        return jsonify({'error': 'La cerradura no cede. Combinación incorrecta.', 'state': _build_state(game)}), 400

@app.route('/api/read_note', methods=['POST'])
def read_note():
    game_id = session.get('game_id')
    game = get_game(game_id)
    room = request.get_json().get('room')
    
    notes_read = json.loads(game.get('notes_read', '[]'))
    if room not in notes_read and room == game['current_room']:
        notes_read.append(room)
        update_game(game_id, notes_read=json.dumps(notes_read))
        game = get_game(game_id)
        
    return jsonify({'success': True, 'state': _build_state(game)})


@app.route('/api/pickup_weight', methods=['POST'])
def pickup_weight():
    game_id = session.get('game_id')
    game = get_game(game_id)
    weight_id = request.get_json().get('weight_id')
    
    pos_weights = json.loads(game.get('pos_weights', '[]'))
    curr_room = game['current_room']
    
    valid = False
    for w in pos_weights:
        if w['id'] == weight_id and w['room'] == curr_room:
            valid = True
            break
            
    if valid:
        collected = json.loads(game.get('weights_collected', '[]'))
        if weight_id not in collected:
            collected.append(weight_id)
            update_game(game_id, weights_collected=json.dumps(collected))
            game = get_game(game_id)
            return jsonify({'success': True, 'state': _build_state(game), 'message': 'Has recogido una figura de la balanza.'})
    
    return jsonify({'error': 'No se pudo recoger la estatuilla.'}), 400


@app.route('/api/solve_anubis', methods=['POST'])
def solve_anubis():
    game_id = session.get('game_id')
    game = get_game(game_id)
    if game.get('anubis_solved'):
        return jsonify({'error': 'Ya resuelto'}), 400
        
    order = request.get_json().get('order', [])
    # Correct condition is finding the perfect balance:
    # 1=Corazon (Heaviest?), 2=Pluma (Lightest), 3=Oro (Medium)
    # Let's say order [Pluma, Corazon, Oro] => [2, 1, 3]
    if order == [2, 1, 3]:
        pieces = json.loads(game['puzzle_pieces'])
        buttons = json.loads(game['buttons_activated'])
        if 3 not in pieces: pieces.append(3)
        if 3 not in buttons: buttons.append(3)
        
        update_game(game_id, anubis_solved=1, puzzle_pieces=json.dumps(pieces), buttons_activated=json.dumps(buttons))
        game = get_game(game_id)
        return jsonify({'success': True, 'message': '⚖️ La balanza ha hablado. Enigma Anubis resuelto. Tienes la Pieza 3.', 'state': _build_state(game)})
    else:
        # Increase error count
        errs = game.get('error_count', 0) + 1
        update_game(game_id, error_count=errs)
        game = get_game(game_id)
        return jsonify({'success': False, 'message': '❌ La balanza rechaza tu ofrenda. Las almas pesan más que el oro, pero menos que la verdad.', 'state': _build_state(game)})


@app.route('/api/solve', methods=['POST'])
def solve():
    game_id = session.get('game_id')
    game = get_game(game_id)
    if not game:
        return jsonify({'error': 'Sin partida'}), 400
    if is_time_up(game):
        return jsonify({'error': '¡Tiempo agotado!', 'game_over': True}), 400

    data    = request.get_json()
    enigma  = data.get('enigma')
    code    = data.get('code', [])
    updates = {}

    if enigma == 1:
        if not game['has_papiro1'] or not game['has_dictionary']:
            return jsonify({'error': 'Necesitas el papiro y el diccionario.'}), 400
        if game['enigma1_solved']:
            return jsonify({'success': False, 'message': '⚠️ Enigma 1 ya está resuelto.'}), 200
        
        e1 = json.loads(game['e1_code'])
        if validate_enigma(e1, code):
            pieces  = json.loads(game['puzzle_pieces'])
            buttons = json.loads(game['buttons_activated'])
            if 1 not in pieces:  pieces.append(1)
            if 1 not in buttons: buttons.append(1)
            updates = {
                'enigma1_solved':    1,
                'puzzle_pieces':     json.dumps(pieces),
                'buttons_activated': json.dumps(buttons),
            }
            msg = '✨ ¡Enigma 1 resuelto! Botón 1 activado. Has obtenido la Pieza 1 del puzzle.'
        else:
            updates['error_count'] = game.get('error_count', 0) + 1
            msg = '❌ Combinación incorrecta. Consulta bien el diccionario.'

    elif enigma == 2:
        if not game['has_papiro2'] or not game['has_dictionary']:
            return jsonify({'error': 'Necesitas el papiro de la Sala 3 y el diccionario.'}), 400
        if game['enigma2_solved']:
            return jsonify({'success': False, 'message': '⚠️ Enigma 2 ya está resuelto.'}), 200
        
        e2 = json.loads(game['e2_code'])
        if validate_enigma(e2, code):
            pieces  = json.loads(game['puzzle_pieces'])
            buttons = json.loads(game['buttons_activated'])
            if 2 not in pieces:  pieces.append(2)
            if 2 not in buttons: buttons.append(2)
            updates = {
                'enigma2_solved':    1,
                'puzzle_pieces':     json.dumps(pieces),
                'buttons_activated': json.dumps(buttons),
            }
            msg = '✨ ¡Enigma 2 resuelto! Botón 2 activado. Has obtenido la Pieza 2 del puzzle.'
        else:
            updates['error_count'] = game.get('error_count', 0) + 1
            msg = '❌ Combinación incorrecta. Observa bien el papiro.'
    else:
        return jsonify({'error': 'Enigma inválido'}), 400

    if updates:
        update_game(game_id, **updates)
    
    game = get_game(game_id)
    return jsonify({'success': True if 'enigma1_solved' in updates or 'enigma2_solved' in updates else False, 'message': msg, 'state': _build_state(game)})


@app.route('/api/hidden_button', methods=['POST'])
def hidden_button():
    # Deprecated/Removed functionality.
    return jsonify({'error': 'Usa la balanza de anubis'}), 400


@app.route('/api/complete_puzzle', methods=['POST'])
def complete_puzzle():
    game_id = session.get('game_id')
    game = get_game(game_id)
    if not game:
        return jsonify({'error': 'Sin partida'}), 400
    if is_time_up(game):
        return jsonify({'error': '¡Tiempo agotado!', 'game_over': True}), 400

    pieces  = json.loads(game['puzzle_pieces'])
    buttons = json.loads(game['buttons_activated'])
    if not all(p in pieces for p in [1, 2, 3]):
        return jsonify({'error': 'Necesitas las 3 piezas del puzzle.'}), 400
    if not all(b in buttons for b in [1, 2, 3]):
        return jsonify({'error': 'Debes activar los 3 botones primero.'}), 400

    import time
    update_game(game_id, puzzle_completed=1, game_won=1, end_time=time.time())
    game = get_game(game_id)
    
    # Process Achievements
    from game.db import get_db
    conn = get_db()
    c = conn.cursor()
    c.execute('SELECT achievements FROM users WHERE id = ?', (game['user_id'],))
    row = c.fetchone()
    my_achievements = json.loads(row['achievements'] if row and row['achievements'] else '[]')
    
    new_achievements = []
    # 1. Perfeccionista
    if game.get('error_count', 0) == 0 and "perfeccionista" not in my_achievements:
        my_achievements.append("perfeccionista")
        new_achievements.append("perfeccionista")
    # 2. Speedrunner
    rem = get_time_remaining(game)
    total = game.get('total_time', 900.0)
    if (rem / total) >= 0.5 and "speedrunner" not in my_achievements:
        my_achievements.append("speedrunner")
        new_achievements.append("speedrunner")
    # 3. Lector
    notes = json.loads(game.get('notes_read', '[]'))
    if len(notes) >= 5 and "lector" not in my_achievements:
        my_achievements.append("lector")
        new_achievements.append("lector")
        
    if new_achievements:
        c.execute('UPDATE users SET achievements = ? WHERE id = ?', (json.dumps(my_achievements), game['user_id']))
        conn.commit()

    secret = game['secret_text']
    base_msg = f'¡Has escapado! El secreto era: «{secret}»'
    
    # Endings logic
    if game.get('has_secret_relic'):
        ending_title = "FINAL VERDADERO: Rey del Inframundo"
        base_msg = f'Al salir con la Reliquia de Kha-Ra bajo el brazo, sientes cómo la pirámide se rinde a tus pies. Has descubierto el secreto: «{secret}»'
        if "final_verdadero" not in new_achievements and "final_verdadero" not in my_achievements:
            my_achievements.append("final_verdadero")
            new_achievements.append("final_verdadero")
            c.execute('UPDATE users SET achievements = ? WHERE id = ?', (json.dumps(my_achievements), game['user_id']))
            conn.commit()
    elif game.get('error_count', 0) > 4:
        ending_title = "FINAL COBARDE: Huida Errática"
        base_msg = f'Saliste corriendo tropezando con cada piedra. Apenas escapaste con el secreto: «{secret}»'
    else:
        ending_title = "FINAL NORMAL: Arqueólogo Sobreviviente"
    
    conn.close()

    msg = f'{ending_title} | {base_msg}'
    if new_achievements:
        msg += f' ¡Logros ganados: {", ".join(new_achievements)}!'

    return jsonify({
        'success': True,
        'message': msg,
        'state': _build_state(game),
    })


# ═══════════════════════════════════════════
#  Leaderboard
# ═══════════════════════════════════════════

@app.route('/api/leaderboard', methods=['GET'])
def get_leaderboard():
    from game.db import get_db
    conn = get_db()
    c = conn.cursor()
    c.execute('''
        SELECT u.username, (g.end_time - g.start_time) as time_taken 
        FROM game_state g
        JOIN users u ON g.user_id = u.id
        WHERE g.game_won = 1 AND g.end_time IS NOT NULL AND g.difficulty = 'easy'
        ORDER BY time_taken ASC
        LIMIT 10
    ''')
    rows = c.fetchall()
    leaderboard = [{'username': r['username'], 'time_taken': r['time_taken']} for r in rows]
    
    c.execute('''
        SELECT u.username, (g.end_time - g.start_time) as time_taken 
        FROM game_state g
        JOIN users u ON g.user_id = u.id
        WHERE g.game_won = 1 AND g.end_time IS NOT NULL AND g.difficulty = 'hard'
        ORDER BY time_taken ASC
        LIMIT 10
    ''')
    rows_h = c.fetchall()
    leaderboard_hard = [{'username': r['username'], 'time_taken': r['time_taken']} for r in rows_h]
    
    conn.close()
    
    return jsonify({'leaderboard': leaderboard, 'leaderboard_hard': leaderboard_hard})

# ═══════════════════════════════════════════
#  Entry point
# ═══════════════════════════════════════════

if __name__ == '__main__':
    init_db()
    app.run(debug=True)
