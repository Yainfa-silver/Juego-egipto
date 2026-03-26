import random
import time

# ── 10 hieroglyphs (Unicode Egyptian block, widely supported in modern browsers)
HIEROGLYPHS = ['𓀀', '𓀁', '𓀂', '𓀃', '𓀄', '𓂀', '𓂋', '𓃀', '𓄿', '𓅱']
HIEROGLYPH_NAMES = ['Ra', 'Osiris', 'Horus', 'Isis', 'Anubis', 'Thoth', 'Bastet', 'Seth', 'Khnum', 'Nut']

# ── Each variant defines which hieroglyph INDICES form the correct 3-symbol code
# This is now generated procedurally.
import random
import time
import json

DICCIONARIO_POSITIONS = [
    {"room": 3, "x": "30%", "y": "22%"},
    {"room": 5, "x": "15%", "y": "30%"},
    {"room": 7, "x": "75%", "y": "20%"}
]

PAPIRO1_POSITIONS = [
    {"room": 2, "x": "60%", "y": "22%"},
    {"room": 4, "x": "80%", "y": "40%"},
    {"room": 6, "x": "50%", "y": "15%"}
]

PAPIRO2_POSITIONS = [
    {"room": 4, "x": "50%", "y": "22%"},
    {"room": 6, "x": "85%", "y": "25%"},
    {"room": 7, "x": "20%", "y": "35%"}
]

WEIGHTS_POSITIONS = [
    [{"id": 1, "room": 3, "x": "20%", "y": "20%", "weight": "corazon"}, {"id": 2, "room": 4, "x": "30%", "y": "25%", "weight": "pluma"}, {"id": 3, "room": 6, "x": "40%", "y": "15%", "weight": "oro"}],
    [{"id": 1, "room": 2, "x": "70%", "y": "10%", "weight": "corazon"}, {"id": 2, "room": 5, "x": "15%", "y": "40%", "weight": "pluma"}, {"id": 3, "room": 7, "x": "35%", "y": "20%", "weight": "oro"}],
    [{"id": 1, "room": 4, "x": "40%", "y": "10%", "weight": "corazon"}, {"id": 2, "room": 6, "x": "55%", "y": "30%", "weight": "pluma"}, {"id": 3, "room": 7, "x": "15%", "y": "20%", "weight": "oro"}]
]

DIARY_MESSAGES = [
    "La puerta se selló a mi espalda. No veo cómo volver. El aire está pesado.",
    "Los dioses dejaron pergaminos. Alguien los partió intentando descifrarlos... o algo peor.",
    "He encontrado las salas profundas. La estatua de Anubis aguarda. Exige pesado tributo.",
    "¡Es inútil! La verdad es ligera como una pluma, el motor humano es carne, pero el materialismo ciega más.",
    "La tumba real. Rebosa riqueza, pero no me servirá de nada si perezco en la oscuridad eternamente.",
    "El eco de mis pasos parece seguido por susurros en una lengua olvidada.",
    "Siento que los ojos de las estatuas se mueven cuando no las miro directamente.",
    "He encontrado restos de una expedición anterior. No hay señales de sus cuerpos, solo sus diarios.",
    "El escarabajo de jade brilla con una luz tenue en la penumbra. ¿Es una señal?",
    "Las paredes están cubiertas de inscripciones que hablan de un faraón que nunca murió.",
    "El aceite de las lámparas se consume más rápido de lo normal. La oscuridad acecha.",
    "Bajo el suelo de arena, he oído el sonido de mecanismos antiguos moviéndose.",
    "La sed empieza a nublar mi juicio, pero la puerta dorada debe estar cerca.",
    "No todos los tesoros de Egipto son de oro; algunos son secretos que deberían permanecer enterrados.",
    "La maldición no era una advertencia, sino una promesa para los intrusos.",
    "He visto una sombra cruzar el pasillo. No era mi propia sombra.",
    "El río Nilo parece fluir en sentido contrario en el mapa de esta pared.",
    "Si encuentras esta nota, no te detengas. Sigue avanzando hacia la luz del sol.",
    "El guardian no duerme. Él es la propia piedra de la pirámide.",
    "Solo aquel que no teme al juicio de Osiris encontrará la salida."
]


def random_positions():
    dic_pos  = random.choice(DICCIONARIO_POSITIONS)
    p1_pos   = random.choice(PAPIRO1_POSITIONS)
    p2_pos   = random.choice(PAPIRO2_POSITIONS)
    w_pos    = random.choice(WEIGHTS_POSITIONS)
    
    # Randomize 5 notes for the current session
    rooms = list(range(1, 8))
    random.shuffle(rooms)
    selected_rooms = rooms[:5]
    selected_msgs = random.sample(DIARY_MESSAGES, 5)
    
    notes_map = {str(rm): msg for rm, msg in zip(selected_rooms, selected_msgs)}
    
    return json.dumps(dic_pos), json.dumps(p1_pos), json.dumps(p2_pos), json.dumps(w_pos), json.dumps(notes_map)

def generate_random_codes():
    indices = list(range(10))
    selected = random.sample(indices, 6)
    e1_code = selected[0:3]
    e2_code = selected[3:6]
    bases = [
        'La eternidad aguarda tras la puerta dorada',
        'El sol renace cada amanecer en el horizonte',
        'El río sagrado guía las almas hacia la luz',
        'En la sombra, el escarabajo de jade descansa',
        'Solo los puros de corazón cruzan el umbral'
    ]
    return e1_code, e2_code, random.choice(bases)

def get_hints(e1_code, e2_code, has_papiro1, has_papiro2, has_dictionary):
    """Return human-readable hints for the papiros (only when items collected)."""
    hint1 = ([HIEROGLYPH_NAMES[i] for i in e1_code]
             if has_papiro1 and has_dictionary else None)
    hint2 = ([HIEROGLYPH_NAMES[i] for i in e2_code]
             if has_papiro2 else None)
    return hint1, hint2

def get_papiro_indices(e1_code, e2_code, has_papiro1, has_papiro2):
    idx1 = e1_code if has_papiro1 else None
    idx2 = e2_code if has_papiro2 else None
    return idx1, idx2

def validate_enigma(correct_code, submitted_code):
    """submitted_code is a list of int indices [a, b, c]."""
    return list(map(int, submitted_code)) == correct_code


def get_time_remaining(game):
    total = game.get('total_time', 900.0)
    remaining = total - (time.time() - game['start_time'])
    return max(0.0, remaining)


def is_time_up(game):
    return get_time_remaining(game) <= 0
