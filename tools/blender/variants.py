"""
Character variants (player + crowd). Each builds into public/models/char_<id>.glb
and shares the skeleton/animations in anims.glb. Band names on prints are plain
text (owner decision D-023/D-025: private project).
"""

M = 'macrodetails/'
BODIES = {
    'brute': [(M + 'universal-male-young-averagemuscle-averageweight.target', 0.35),
              (M + 'universal-male-young-maxmuscle-averageweight.target', 0.45),
              (M + 'universal-male-young-averagemuscle-maxweight.target', 0.2)],
    'average': [(M + 'universal-male-young-averagemuscle-averageweight.target', 1.0)],
    'heavy': [(M + 'universal-male-young-averagemuscle-maxweight.target', 0.7),
              (M + 'universal-male-young-averagemuscle-averageweight.target', 0.3)],
    'slim': [(M + 'universal-male-young-averagemuscle-minweight.target', 0.6),
             (M + 'universal-male-young-averagemuscle-averageweight.target', 0.4)],
}
ETHNIC = {
    'caucasian': (M + 'caucasian-male-young.target', (0.78, 0.56, 0.44)),
    'african': (M + 'african-male-young.target', (0.36, 0.22, 0.15)),
    'asian': (M + 'asian-male-young.target', (0.80, 0.62, 0.48)),
}
DARK_HAIR = (0.07, 0.05, 0.04)
BROWN_HAIR = (0.16, 0.10, 0.06)


def v(body, ethnic, *, hair='buzz', beard='none', hair_color=DARK_HAIR, shirt, pants, head='none', head_color=(0.05, 0.05, 0.06),
      head_logo=None, shoes=(0.92, 0.92, 0.9), lod=1.0, tex=1024):
    return {'body': BODIES[body] + [(ETHNIC[ethnic][0], 1.0)], 'skin': ETHNIC[ethnic][1], 'hair': hair, 'beard': beard,
            'hair_color': hair_color, 'shirt': shirt, 'pants': pants, 'head': head, 'head_color': head_color,
            'head_logo': head_logo, 'shoes': shoes, 'lod': lod, 'tex': tex}


def tee(color, text=None, ink=(0.93, 0.93, 0.9), pattern='plain', sleeves='short', fit=1.11):
    return {'color': color, 'text': text, 'ink': ink, 'pattern': pattern, 'sleeves': sleeves, 'fit': fit}


def pants(fabric, color=(0.16, 0.25, 0.42), cut='baggy'):
    return {'fabric': fabric, 'color': color, 'cut': cut}


BLACK = (0.035, 0.035, 0.04)
CROWD = dict(lod=0.4, tex=512)

VARIANTS = {
    'player': v('brute', 'caucasian', beard='full', shirt=tee((0.93, 0.92, 0.9), 'MOSH PIT', ink=(0.75, 0.06, 0.06)),
                pants=pants('camo', cut='baggy'), head='cap_back', head_color=(0.55, 0.04, 0.04)),
    'c1': v('average', 'african', hair='none', beard='stubble', shirt=tee(BLACK, 'TERROR'),
            pants=pants('denim', (0.05, 0.05, 0.06)), **CROWD),
    'c2': v('heavy', 'caucasian', beard='full', hair_color=BROWN_HAIR, shirt=tee((0.45, 0.05, 0.05), pattern='flannel', sleeves='long'),
            pants=pants('denim'), head='beanie', head_color=(0.06, 0.06, 0.07), **CROWD),
    'c3': v('slim', 'asian', shirt=tee((0.93, 0.93, 0.9), pattern='pinstripe'), pants=pants('khaki', (0.55, 0.47, 0.32), cut='shorts'),
            head='cap', head_color=(0.08, 0.1, 0.2), head_logo='B', **CROWD),
    'c4': v('brute', 'caucasian', hair='none', beard='full', shirt=tee(BLACK, 'SICK OF IT ALL', sleeves='long', fit=1.16),
            pants=pants('camo'), **CROWD),
    'c5': v('brute', 'african', beard='full', shirt=tee((0.93, 0.93, 0.9), 'MADBALL', ink=(0.05, 0.05, 0.05)),
            pants=pants('track', BLACK, cut='slim'), head='cap_back', **CROWD),
    'c6': v('average', 'caucasian', beard='stubble', hair_color=BROWN_HAIR, shirt=tee((0.35, 0.35, 0.37), 'KNOCKED LOOSE', ink=(0.05, 0.05, 0.05)),
            pants=pants('denim', cut='slim'), head='beanie', head_color=(0.35, 0.35, 0.36), **CROWD),
    'c7': v('heavy', 'asian', beard='full', shirt=tee(BLACK, 'TURNSTILE'), pants=pants('denim', BLACK, cut='shorts'),
            head='cap', head_logo='HC', **CROWD),
    'c8': v('average', 'african', hair='none', beard='stubble', shirt=tee(BLACK, 'HATEBREED', ink=(0.8, 0.1, 0.08)),
            pants=pants('denim'), **CROWD),
}
