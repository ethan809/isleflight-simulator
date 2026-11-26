"""Convert FlightGear's GPL-v2 AC3D aircraft exteriors to compact glTF GLB.

Run with blender -b --python Concorde.converter.py -- SOURCE.ac TARGET.glb [EXTRA.ac ...]
Supported sources: FGMEMBERS/Concorde, FGMEMBERS/737-800.
"""
import bpy
import math
import shlex
import sys
from pathlib import Path

args = sys.argv[sys.argv.index('--') + 1:]
src, target = Path(args[0]), Path(args[1])
extra_sources = [Path(path) for path in args[2:]]
is_concorde = 'concorde' in src.stem.lower()
lines = src.read_text(encoding='utf-8', errors='replace').splitlines()
if lines[0] != 'AC3Db':
    raise ValueError('Not an AC3D model')

position = 1
materials = []
while position < len(lines) and lines[position].startswith('MATERIAL'):
    words = shlex.split(lines[position])
    r = words.index('rgb')
    materials.append((words[1], tuple(map(float, words[r+1:r+4]))))
    position += 1

all_positions = []
all_faces = []
all_uv = []
all_materials = []
material_map = {}
material_offset = 0

def transform(mat, xyz):
    x, y, z = xyz
    return (mat[0]*x+mat[1]*y+mat[2]*z+mat[9],
            mat[3]*x+mat[4]*y+mat[5]*z+mat[10],
            mat[6]*x+mat[7]*y+mat[8]*z+mat[11])

identity = (1,0,0,0,1,0,0,0,1,0,0,0)

def compose(parent, local, origin):
    new = tuple(sum(parent[row*3+k]*local[k*3+column] for k in range(3))
                for row in range(3) for column in range(3))
    delta = transform(parent, origin)
    return new + delta

def parse(parent=identity):
    global position
    if position >= len(lines):
        raise ValueError(f'Unexpected end of AC3D file at {position}/{len(lines)}')
    if not lines[position].startswith('OBJECT '):
        raise ValueError(f'Expected OBJECT at {position}: {lines[position][:70]}')
    position += 1
    name = ''
    coords = []
    texture = None
    loc = (0,0,0)
    rot = identity[:9]
    texrep = (1,1)
    surfaces = []
    count = 0
    while position < len(lines):
        line = lines[position].strip()
        position += 1
        if line.startswith('name '):
            name = line[5:].strip('"')
        elif line.startswith('texture '):
            texture = line[8:].strip('"')
        elif line.startswith('loc '):
            loc = tuple(map(float, line[4:].split()))
        elif line.startswith('rot '):
            rot = tuple(map(float, line[4:].split()))
        elif line.startswith('texrep '):
            texrep = tuple(map(float, line[7:].split()))
        elif line.startswith('data '):
            # AC3D data is a byte count followed by one payload line.
            position += 1
        elif line.startswith('numvert '):
            n = int(line.split()[1])
            coords = [tuple(map(float, lines[position+i].split()[:3])) for i in range(n)]
            position += n
        elif line.startswith('numsurf '):
            n = int(line.split()[1])
            for _ in range(n):
                flag = 0
                mat = 0
                while position < len(lines):
                    row = lines[position].strip()
                    position += 1
                    if row.startswith('SURF '):
                        flag = int(row.split()[1], 16)
                    elif row.startswith('mat '):
                        mat = int(row.split()[1])
                    elif row.startswith('refs '):
                        length = int(row.split()[1])
                        refs = [lines[position+i].split() for i in range(length)]
                        position += length
                        if flag & 0x0f == 0 and length >= 3:
                            surfaces.append((mat, refs))
                        break
        elif line.startswith('kids '):
            count = int(line.split()[1])
            break
    matx = compose(parent, rot, loc)
    local_points = [transform(matx, point) for point in coords]
    for mat, refs in surfaces:
        # Animated afterburner flame meshes in the donor are not part of the
        # parked aircraft's airframe; adding them statically makes glowing
        # orange tubes protrude from every engine at idle.
        # FlightGear also ships a detailed cockpit-interior shell whose dark
        # instrument textures protrude through the exterior from chase view.
        # Isleflight renders its cockpit independently, so omit that shell.
        if is_concorde and (mat in (4, 5, 6) or texture == 'concorde-cockpit-textures.webp'):
            continue
        key = (max(0, min(mat + material_offset, len(materials)-1)), texture)
        if key not in material_map:
            material_map[key] = len(material_map)
        mid = material_map[key]
        for j in range(1, len(refs)-1):
            tri = (refs[0], refs[j], refs[j+1])
            face = []
            uv = []
            for ref in tri:
                i = int(ref[0]); pos = local_points[i]
                # FlightGear AC3D uses X along fuselage, Y across, Z vertical.
                # Reorient later once the source extents are known.
                face.append(len(all_positions)); all_positions.append(pos)
                uv.append((float(ref[1])*texrep[0], float(ref[2])*texrep[1]))
            all_faces.append(face)
            all_uv.append(uv)
            all_materials.append(mid)
    for _ in range(count):
        if position >= len(lines):
            # The FlightGear Concorde's root reports 104 children but the file
            # holds 103 child OBJECT blocks. All actual surfaces were read.
            if parent == identity:
                break
            raise ValueError(f'Premature EOF inside {name!r}, expected {count} children')
        parse(matx)
    return name

parse()
for extra in extra_sources:
    lines = extra.read_text(encoding='utf-8', errors='replace').splitlines()
    if lines[0] != 'AC3Db':
        raise ValueError(f'Not an AC3D model: {extra}')
    position = 1
    material_offset = len(materials)
    while position < len(lines) and lines[position].startswith('MATERIAL'):
        words = shlex.split(lines[position])
        r = words.index('rgb')
        materials.append((words[1], tuple(map(float, words[r+1:r+4]))))
        position += 1
    parse()
print('Parsed', src.name, len(all_positions), 'vertices,', len(all_faces), 'triangles,', len(material_map), 'materials')
from collections import Counter
summary=Counter(all_materials)
for key, ix in material_map.items():
    positions=[all_positions[j] for face, m in zip(all_faces, all_materials) if m==ix for j in face]
    if positions:
        bounds=[(round(min(v[i] for v in positions),1),round(max(v[i] for v in positions),1)) for i in range(3)]
        print('Material', ix, key, summary[ix], 'bounds', bounds)
limits = [(min(v[i] for v in all_positions), max(v[i] for v in all_positions)) for i in range(3)]
print('Source extents', limits)

# Source is X nose-to-tail, Y vertical, Z wingtip-to-wingtip. Blender is Z-up,
# so swap Y and Z before glTF export (which puts the original Y back upward).
all_positions = [(x,z,y) for x,y,z in all_positions]
# The game's mesh conversion then normalises and scales to real dimensions.
bpy.ops.object.select_all(action='SELECT')
bpy.ops.object.delete(use_global=False)
mesh = bpy.data.meshes.new('FlightGear external airframe')
mesh.from_pydata(all_positions, [], all_faces)
mesh.update()
obj = bpy.data.objects.new(src.stem + ' - FlightGear GPLv2', mesh)
bpy.context.collection.objects.link(obj)
bpy.context.view_layer.objects.active = obj
obj.select_set(True)

for (midx, tex), material_idx in sorted(material_map.items(), key=lambda kv: kv[1]):
    material = bpy.data.materials.new(f'FG aircraft {material_idx} {materials[midx][0]}')
    material.use_nodes = True
    nodes = material.node_tree.nodes
    bsdf = nodes.get('Principled BSDF')
    rgb = materials[midx][1]
    bsdf.inputs['Base Color'].default_value = (*rgb, 1)
    bsdf.inputs['Metallic'].default_value = 0.16
    bsdf.inputs['Roughness'].default_value = 0.38
    if tex:
        texture_path = src.parent / tex
        if texture_path.exists():
            image_node = nodes.new('ShaderNodeTexImage')
            image_node.image = bpy.data.images.load(str(texture_path), check_existing=True)
            material.node_tree.links.new(image_node.outputs['Color'], bsdf.inputs['Base Color'])
    mesh.materials.append(material)

uv_layer = mesh.uv_layers.new(name='UVMap')
for poly, m, uvs in zip(mesh.polygons, all_materials, all_uv):
    poly.material_index = m
    for loop_idx, uv in zip(poly.loop_indices, uvs):
        uv_layer.data[loop_idx].uv = uv

# Original parts include redundant fine tessellation; safely reduce it for the
# website while keeping the FlightGear-made silhouette and texture mapping.
target_faces = 34000 if is_concorde else 15000
if len(all_faces) > target_faces:
    modifier = obj.modifiers.new('Aircraft mobile LOD', 'DECIMATE')
    modifier.ratio = max(.30, target_faces/len(all_faces))
    bpy.ops.object.modifier_apply(modifier=modifier.name)

target.parent.mkdir(parents=True, exist_ok=True)
bpy.ops.export_scene.gltf(filepath=str(target), export_format='GLB', use_selection=True,
                          export_yup=True, export_image_format='AUTO')
print('Wrote', target, target.stat().st_size, 'bytes')
