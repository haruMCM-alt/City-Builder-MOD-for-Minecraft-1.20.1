# BLACKSAND : AFTERLIGHT  v28.34beta  /  AeroForge airframes
# Blender 5.x  >  Scripting  >  New  >  paste  >  Run
# loft = Add Circle xN + Bridge Edge Loops / plate = Add Plane + Extrude Region / spin = Spin
import bpy, bmesh, math
from mathutils import Vector

def _mat(name, rgb, rough=0.58, metal=0.42, alpha=1.0, emit=0.0):
    m = bpy.data.materials.get(name) or bpy.data.materials.new(name)
    m.use_nodes = True
    b = m.node_tree.nodes["Principled BSDF"]
    b.inputs["Base Color"].default_value = (rgb[0], rgb[1], rgb[2], 1.0)
    b.inputs["Roughness"].default_value = rough
    b.inputs["Metallic"].default_value = metal
    if emit > 0.0:
        b.inputs["Emission Color"].default_value = (rgb[0], rgb[1], rgb[2], 1.0)
        b.inputs["Emission Strength"].default_value = emit
    if alpha < 1.0:
        m.blend_method = "BLEND"
        b.inputs["Alpha"].default_value = alpha
    return m

def _finish(bm, name, coll, mat, loc, rot, mirror):
    me = bpy.data.meshes.new(name)
    bm.to_mesh(me); bm.free()
    ob = bpy.data.objects.new(name, me)
    coll.objects.link(ob)
    ob.location = Vector(loc)
    ob.rotation_euler = rot
    ob.data.materials.append(mat)
    for p in ob.data.polygons: p.use_smooth = True
    if mirror:
        md = ob.modifiers.new("Mirror", "MIRROR")
        md.use_axis[0] = True
    return ob

def loft(sections, seg, name, coll, mat, loc, rot, mirror):
    bm = bmesh.new(); rings = []
    for s in sections:
        ring = []
        for i in range(seg):
            a = i / seg * math.tau; c = math.cos(a); si = math.sin(a); e = s.get("e", 1.6)
            fx = math.copysign(abs(c) ** (2 / e), c); fy = math.copysign(abs(si) ** (2 / e), si)
            ring.append(bm.verts.new((fx * s["w"], s.get("y", 0.0) + fy * s["h"], s["z"])))
        rings.append(ring)
    for k in range(len(rings) - 1):
        a, b = rings[k], rings[k + 1]
        for i in range(seg):
            j = (i + 1) % seg
            bm.faces.new((a[i], b[i], b[j], a[j]))   # bridge edge loops
    for ring, s in ((rings[0], sections[0]), (rings[-1], sections[-1])):
        bm.faces.new(ring)                            # cap (grid fill)
    bmesh.ops.recalc_face_normals(bm, faces=bm.faces[:])
    return _finish(bm, name, coll, mat, loc, rot, mirror)

def plate(outline, th, span, dihedral, name, coll, mat, loc, rot, mirror):
    bm = bmesh.new()
    verts = []
    for x, z in outline:
        y = abs(x) * math.tan(math.radians(dihedral))
        verts.append(bm.verts.new((x, y, z)))
    face = bm.faces.new(verts)                        # add plane
    bmesh.ops.recalc_face_normals(bm, faces=[face])
    r = bmesh.ops.extrude_face_region(bm, geom=[face])  # extrude region
    moved = [v for v in r["geom"] if isinstance(v, bmesh.types.BMVert)]
    bmesh.ops.translate(bm, verts=moved, vec=(0.0, -th, 0.0))
    bmesh.ops.recalc_face_normals(bm, faces=bm.faces[:])
    return _finish(bm, name, coll, mat, loc, rot, mirror)

def spin(profile, seg, name, coll, mat, loc, rot, mirror):
    bm = bmesh.new()
    verts = [bm.verts.new((r, y, 0.0)) for r, y in profile]
    edges = [bm.edges.new((verts[i], verts[i + 1])) for i in range(len(verts) - 1)]
    bmesh.ops.spin(bm, geom=verts + edges, axis=(0, 1, 0), cent=(0, 0, 0),
                   dvec=(0, 0, 0), angle=math.tau, steps=seg, use_merge=True)
    bmesh.ops.recalc_face_normals(bm, faces=bm.faces[:])
    return _finish(bm, name, coll, mat, loc, rot, mirror)

def build(key, parts):
    coll = bpy.data.collections.new(key)
    bpy.context.scene.collection.children.link(coll)
    for p in parts:
        mat = _mat(key + "_" + p["name"], p["rgb"], p.get("rough", 0.58), p.get("metal", 0.42),
                   p.get("alpha", 1.0), p.get("emit", 0.0))
        loc = p.get("loc", (0, 0, 0)); rot = p.get("rot", (0, 0, 0)); mir = p.get("mirror", False)
        if p["op"] == "loft":   loft(p["sections"], p.get("seg", 12), p["name"], coll, mat, loc, rot, mir)
        elif p["op"] == "plate": plate(p["outline"], p["th"], p.get("span", 1.0), p.get("dihedral", 0.0), p["name"], coll, mat, loc, rot, mir)
        else:                    spin(p["profile"], p.get("seg", 12), p["name"], coll, mat, loc, rot, mir)

AIRFRAMES = {
  "f15": [  # F-15J EAGLE
    {"op": "loft", "name": "fuselage", "rgb": (0.2664, 0.3185, 0.3663), "seg": 14, "sections": [{"z": -9.7, "w": 0.05, "h": 0.05, "y": 0}, {"z": -8.8, "w": 0.42, "h": 0.34, "y": -0.05}, {"z": -7.4, "w": 0.86, "h": 0.62, "y": -0.02}, {"z": -5.8, "w": 1.15, "h": 0.82, "y": 0}, {"z": -3.4, "w": 1.42, "h": 0.95, "y": 0.05}, {"z": -0.8, "w": 1.55, "h": 1, "y": 0.08}, {"z": 2.2, "w": 1.5, "h": 0.96, "y": 0.05}, {"z": 5, "w": 1.34, "h": 0.86, "y": 0}, {"z": 7.4, "w": 1.1, "h": 0.74, "y": -0.02}, {"z": 9, "w": 0.9, "h": 0.66, "y": -0.02}]},
    {"op": "plate", "name": "wing", "rgb": (0.2664, 0.3185, 0.3663), "outline": [(1.2, -3), (7.6, 1.4), (7.6, 2.6), (1.2, 3.4)], "th": 0.42, "span": 7.6, "dihedral": -0.6, "loc": (0, -0.18, 0), "mirror": True},
    {"op": "plate", "name": "stabilator", "rgb": (0.2232, 0.2705, 0.3140), "outline": [(1.1, 5.6), (5.4, 7.9), (5.4, 8.9), (1.1, 8.4)], "th": 0.26, "span": 5.4, "dihedral": 0, "loc": (0, -0.1, 0), "mirror": True},
    {"op": "plate", "name": "fin", "rgb": (0.2232, 0.2705, 0.3140), "outline": [(0.1, 4.2), (0.1, 8.6), (1.1, 8.9), (2.6, 8.6), (2.6, 5.4)], "th": 0.26, "span": 2.6, "dihedral": 0, "loc": (1.05, 1.1, 0), "rot": (0.0000, 0.0000, 1.5708), "mirror": True},
    {"op": "loft", "name": "intake", "rgb": (0.1812, 0.2232, 0.2623), "seg": 8, "sections": [{"z": -4.6, "w": 0.52, "h": 0.72, "y": 0}, {"z": -3.6, "w": 0.62, "h": 0.86, "y": 0}, {"z": -0.5, "w": 0.66, "h": 0.9, "y": 0}, {"z": 3.2, "w": 0.62, "h": 0.86, "y": 0}], "loc": (1.45, -0.28, 0), "mirror": True},
    {"op": "spin", "name": "nozzle", "rgb": (0.0723, 0.0782, 0.0742), "seg": 12, "profile": [(0.62, -0.9), (0.7, -0.2), (0.66, 0.35), (0.52, 0.9)], "loc": (0.78, -0.18, 8.6), "rot": (1.5708, 0.0000, 0.0000), "mirror": True},
    {"op": "spin", "name": "burner", "rgb": (1.0000, 0.3231, 0.0742), "seg": 10, "profile": [(0.5, -0.4), (0.34, 0.9), (0.12, 2.3)], "loc": (0.78, -0.18, 9.35), "rot": (1.5708, 0.0000, 0.0000), "mirror": True, "emit": 1.6, "rough": 0.4, "metal": 0.0},
    {"op": "loft", "name": "canopy", "rgb": (0.0252, 0.0497, 0.0685), "seg": 12, "sections": [{"z": -6.5, "w": 0.16, "h": 0.1, "y": 0}, {"z": -5.6, "w": 0.52, "h": 0.38, "y": 0}, {"z": -4.4, "w": 0.62, "h": 0.48, "y": 0}, {"z": -2.9, "w": 0.6, "h": 0.44, "y": 0}, {"z": -2, "w": 0.42, "h": 0.2, "y": 0}], "loc": (0, 0.86, 0), "alpha": 0.62, "rough": 0.12, "metal": 0.85},
    {"op": "loft", "name": "radome", "rgb": (0.0296, 0.0356, 0.0423), "seg": 12, "sections": [{"z": -9.9, "w": 0.03, "h": 0.03, "y": 0}, {"z": -9.2, "w": 0.3, "h": 0.26, "y": 0}, {"z": -8.6, "w": 0.44, "h": 0.38, "y": 0}], "loc": (0, -0.05, 0)},
    {"op": "plate", "name": "pylon", "rgb": (0.1529, 0.1845, 0.2159), "outline": [(3, -0.9), (3.34, -0.9), (3.34, 1.9), (3, 1.9)], "th": 0.7, "span": 3.4, "dihedral": 0, "loc": (0, -0.62, 0), "mirror": True},
    {"op": "spin", "name": "missile", "rgb": (0.4735, 0.4508, 0.3712), "seg": 10, "profile": [(0.02, -1.9), (0.16, -1.5), (0.18, 1.3), (0.12, 1.8)], "loc": (3.18, -1, -0.4), "rot": (1.5708, 0.0000, 0.0000), "mirror": True},
    {"op": "spin", "name": "tank", "rgb": (0.2582, 0.2831, 0.3140), "seg": 12, "profile": [(0.05, -3.2), (0.42, -2.3), (0.46, 1.8), (0.18, 3)], "loc": (0, -1.25, 1.2), "rot": (1.5708, 0.0000, 0.0000)},
  ],
  "mq9": [  # MQ-9 SANDPIPER
    {"op": "loft", "name": "fuselage", "rgb": (0.4851, 0.4678, 0.3813), "seg": 12, "sections": [{"z": -5.6, "w": 0.28, "h": 0.3, "y": 0.05}, {"z": -5, "w": 0.62, "h": 0.66, "y": 0.1}, {"z": -3.6, "w": 0.72, "h": 0.78, "y": 0.06}, {"z": -1.2, "w": 0.6, "h": 0.62, "y": 0}, {"z": 1.6, "w": 0.42, "h": 0.44, "y": 0}, {"z": 4.2, "w": 0.26, "h": 0.28, "y": 0}, {"z": 5.4, "w": 0.14, "h": 0.16, "y": 0}]},
    {"op": "plate", "name": "wing", "rgb": (0.5457, 0.5271, 0.4342), "outline": [(0.5, -1.2), (10.2, -0.3), (10.2, 0.45), (0.5, 1.1)], "th": 0.3, "span": 10.2, "dihedral": 1.5, "loc": (0, 0.28, -0.6), "mirror": True},
    {"op": "plate", "name": "vtail", "rgb": (0.5457, 0.5271, 0.4342), "outline": [(0.1, 3.9), (0.1, 5.5), (1, 5.6), (2.3, 5.3), (2.3, 4.4)], "th": 0.2, "span": 2.3, "dihedral": 0, "loc": (0.3, 0.2, 0), "rot": (0.0000, 0.0000, 1.2320), "mirror": True},
    {"op": "spin", "name": "sensorBall", "rgb": (0.3372, 0.3231, 0.2623), "seg": 14, "profile": [(0.05, -0.62), (0.34, -0.48), (0.46, -0.2), (0.46, 0.16), (0.3, 0.4), (0.05, 0.5)], "loc": (0, -0.62, -4.5)},
    {"op": "spin", "name": "sensorWindow", "rgb": (0.0232, 0.0343, 0.0369), "seg": 12, "profile": [(0.02, -0.06), (0.2, -0.02), (0.24, 0.06)], "loc": (0, -0.98, -4.62), "rot": (0.5000, 0.0000, 0.0000), "alpha": 0.62, "rough": 0.12, "metal": 0.85},
    {"op": "plate", "name": "prop", "rgb": (0.0685, 0.0685, 0.0578), "outline": [(0.04, -0.1), (1.55, -0.24), (1.55, 0.24), (0.04, 0.1)], "th": 0.09, "span": 1.55, "dihedral": 0, "loc": (0, 0, 5.6), "mirror": True},
    {"op": "spin", "name": "spinner", "rgb": (0.1590, 0.1529, 0.1274), "seg": 10, "profile": [(0.04, -0.3), (0.2, -0.05), (0.16, 0.3)], "loc": (0, 0, 5.5), "rot": (1.5708, 0.0000, 0.0000)},
    {"op": "plate", "name": "pylon", "rgb": (0.1529, 0.1845, 0.2159), "outline": [(2.2, -0.5), (2.5, -0.5), (2.5, 1.1), (2.2, 1.1)], "th": 0.5, "span": 2.5, "dihedral": 0, "loc": (0, -0.1, -0.6), "mirror": True},
    {"op": "spin", "name": "hellfire", "rgb": (0.2664, 0.2542, 0.2051), "seg": 8, "profile": [(0.02, -0.85), (0.1, -0.62), (0.11, 0.6), (0.07, 0.85)], "loc": (2.35, -0.5, -1), "rot": (1.5708, 0.0000, 0.0000), "mirror": True},
    {"op": "spin", "name": "satdome", "rgb": (0.4851, 0.4678, 0.3813), "seg": 12, "profile": [(0.05, 0), (0.36, 0.1), (0.44, 0.32), (0.24, 0.52), (0.04, 0.58)], "loc": (0, 0.42, -4)},
  ],
  "su27": [  # ADVERSARY FLANKER
    {"op": "loft", "name": "fuselage", "rgb": (0.1046, 0.1470, 0.1878), "seg": 14, "sections": [{"z": -10.6, "w": 0.05, "h": 0.05, "y": 0}, {"z": -9.4, "w": 0.44, "h": 0.4, "y": 0}, {"z": -7.6, "w": 0.9, "h": 0.72, "y": 0.05}, {"z": -5.2, "w": 1.3, "h": 0.92, "y": 0.1}, {"z": -2, "w": 1.66, "h": 1, "y": 0.12}, {"z": 1.4, "w": 1.7, "h": 0.96, "y": 0.08}, {"z": 5.2, "w": 1.4, "h": 0.84, "y": 0}, {"z": 8.8, "w": 1.05, "h": 0.7, "y": 0}]},
    {"op": "plate", "name": "wing", "rgb": (0.1046, 0.1470, 0.1878), "outline": [(1.4, -3.6), (7.9, 1.9), (7.9, 3), (1.4, 3.6)], "th": 0.44, "span": 7.9, "dihedral": -1.2, "loc": (0, -0.1, 0), "mirror": True},
    {"op": "plate", "name": "stabilator", "rgb": (0.0865, 0.1195, 0.1529), "outline": [(1.2, 5.4), (5, 7.8), (5, 8.8), (1.2, 8.2)], "th": 0.26, "span": 5, "dihedral": 0, "loc": (0, -0.05, 0), "mirror": True},
    {"op": "plate", "name": "fin", "rgb": (0.0865, 0.1195, 0.1529), "outline": [(0.1, 4.4), (0.1, 8.4), (1, 8.8), (2.9, 8.4), (2.9, 5.6)], "th": 0.24, "span": 2.9, "dihedral": 0, "loc": (1.5, 1.05, 0), "rot": (0.0000, 0.0900, 1.5708), "mirror": True},
    {"op": "spin", "name": "nozzle", "rgb": (0.0595, 0.0648, 0.0685), "seg": 12, "profile": [(0.68, -0.9), (0.76, -0.1), (0.7, 0.5), (0.56, 1)], "loc": (0.95, -0.1, 8.7), "rot": (1.5708, 0.0000, 0.0000), "mirror": True},
    {"op": "spin", "name": "burner", "rgb": (1.0000, 0.3231, 0.0742), "seg": 10, "profile": [(0.54, -0.4), (0.36, 1), (0.14, 2.6)], "loc": (0.95, -0.1, 9.5), "rot": (1.5708, 0.0000, 0.0000), "mirror": True, "emit": 1.6, "rough": 0.4, "metal": 0.0},
    {"op": "loft", "name": "canopy", "rgb": (0.0194, 0.0423, 0.0578), "seg": 12, "sections": [{"z": -7.2, "w": 0.16, "h": 0.1, "y": 0}, {"z": -6.2, "w": 0.55, "h": 0.4, "y": 0}, {"z": -4.8, "w": 0.64, "h": 0.5, "y": 0}, {"z": -3.2, "w": 0.6, "h": 0.44, "y": 0}, {"z": -2.2, "w": 0.4, "h": 0.18, "y": 0}], "loc": (0, 0.92, 0), "alpha": 0.62, "rough": 0.12, "metal": 0.85},
    {"op": "loft", "name": "radome", "rgb": (0.0252, 0.0296, 0.0331), "seg": 12, "sections": [{"z": -10.8, "w": 0.03, "h": 0.03, "y": 0}, {"z": -10, "w": 0.34, "h": 0.3, "y": 0}, {"z": -9.3, "w": 0.48, "h": 0.42, "y": 0}]},
    {"op": "loft", "name": "intake", "rgb": (0.0762, 0.1070, 0.1356), "seg": 8, "sections": [{"z": -4.4, "w": 0.6, "h": 0.7, "y": 0}, {"z": -2, "w": 0.66, "h": 0.8, "y": 0}, {"z": 2.6, "w": 0.6, "h": 0.72, "y": 0}], "loc": (1.6, -0.5, 0), "mirror": True},
  ],
  "c130": [  # TRANSPORT HERCULES
    {"op": "loft", "name": "fuselage", "rgb": (0.2122, 0.2423, 0.1912), "seg": 14, "sections": [{"z": -14, "w": 0.6, "h": 0.9, "y": 0.1}, {"z": -12.4, "w": 1.5, "h": 1.7, "y": 0}, {"z": -9, "w": 1.95, "h": 2.05, "y": 0}, {"z": 2, "w": 1.95, "h": 2.05, "y": 0}, {"z": 8, "w": 1.8, "h": 1.95, "y": 0}, {"z": 13, "w": 1, "h": 1.5, "y": 0.6}, {"z": 15.5, "w": 0.5, "h": 1, "y": 1.1}]},
    {"op": "plate", "name": "wing", "rgb": (0.2122, 0.2423, 0.1912), "outline": [(1.6, -4.4), (20, -2.6), (20, -1.2), (1.6, -0.4)], "th": 0.9, "span": 20, "dihedral": 0.5, "loc": (0, 1.9, 0), "mirror": True},
    {"op": "plate", "name": "stabilizer", "rgb": (0.1812, 0.2086, 0.1620), "outline": [(1, 12), (8, 12.6), (8, 14.2), (1, 14.4)], "th": 0.45, "span": 8, "dihedral": 0, "loc": (0, 1.6, 0), "mirror": True},
    {"op": "plate", "name": "fin", "rgb": (0.1812, 0.2086, 0.1620), "outline": [(0.2, 10.4), (0.2, 15), (2, 15.2), (5.6, 14), (5.6, 11.6)], "th": 0.4, "span": 5.6, "dihedral": 0, "loc": (2, 2.1, 0), "rot": (0.0000, 0.0000, 1.5708)},
    {"op": "spin", "name": "engine", "rgb": (0.1095, 0.1248, 0.1070), "seg": 10, "profile": [(0.3, -2.6), (0.8, -1.6), (0.82, 1.4), (0.5, 2.2)], "loc": (5.4, 1.6, -3.2), "rot": (1.5708, 0.0000, 0.0000), "mirror": True},
    {"op": "spin", "name": "engineOuter", "rgb": (0.1095, 0.1248, 0.1070), "seg": 10, "profile": [(0.3, -2.4), (0.75, -1.5), (0.78, 1.3), (0.48, 2)], "loc": (10.6, 1.7, -2.6), "rot": (1.5708, 0.0000, 0.0000), "mirror": True},
    {"op": "plate", "name": "blade", "rgb": (0.0437, 0.0497, 0.0423), "outline": [(0.1, -0.2), (2.1, -0.4), (2.1, 0.4), (0.1, 0.2)], "th": 0.14, "span": 2.1, "dihedral": 0, "loc": (5.4, 1.6, -5.9), "mirror": True},
    {"op": "plate", "name": "bladeOuter", "rgb": (0.0437, 0.0497, 0.0423), "outline": [(0.1, -0.2), (2, -0.38), (2, 0.38), (0.1, 0.2)], "th": 0.14, "span": 2, "dihedral": 0, "loc": (10.6, 1.7, -5.2), "mirror": True},
    {"op": "loft", "name": "cockpitGlass", "rgb": (0.0176, 0.0319, 0.0423), "seg": 10, "sections": [{"z": -13.6, "w": 0.7, "h": 0.4, "y": 0}, {"z": -12.6, "w": 1.2, "h": 0.6, "y": 0}, {"z": -11.4, "w": 1.3, "h": 0.6, "y": 0}], "loc": (0, 1.5, 0), "alpha": 0.62, "rough": 0.12, "metal": 0.85},
  ],
  "awacs": [  # AEW WINDOW
    {"op": "loft", "name": "fuselage", "rgb": (0.6724, 0.6939, 0.6445), "seg": 14, "sections": [{"z": -20, "w": 0.7, "h": 0.9, "y": 0}, {"z": -17, "w": 2.2, "h": 2.4, "y": 0}, {"z": -10, "w": 2.7, "h": 2.8, "y": 0}, {"z": 8, "w": 2.7, "h": 2.8, "y": 0}, {"z": 17, "w": 1.8, "h": 2.2, "y": 0.6}, {"z": 22, "w": 0.6, "h": 1.1, "y": 1.4}]},
    {"op": "plate", "name": "wing", "rgb": (0.6308, 0.6514, 0.6038), "outline": [(2.4, -3), (24, 4), (24, 6.4), (2.4, 2.6)], "th": 1.1, "span": 24, "dihedral": 3, "loc": (0, -1.2, 0), "mirror": True},
    {"op": "plate", "name": "stabilizer", "rgb": (0.6308, 0.6514, 0.6038), "outline": [(1.4, 16), (9.5, 18.2), (9.5, 19.8), (1.4, 19)], "th": 0.5, "span": 9.5, "dihedral": 0, "loc": (0, 1, 0), "mirror": True},
    {"op": "plate", "name": "fin", "rgb": (0.6308, 0.6514, 0.6038), "outline": [(0.3, 13), (0.3, 19.6), (2.4, 20), (7.2, 18.6), (7.2, 15)], "th": 0.5, "span": 7.2, "dihedral": 0, "loc": (2.6, 2.6, 0), "rot": (0.0000, 0.0000, 1.5708)},
    {"op": "spin", "name": "engine", "rgb": (0.1559, 0.1779, 0.1620), "seg": 10, "profile": [(0.5, -3), (1.25, -2), (1.3, 2), (0.8, 3)], "loc": (8, -1.9, -3), "rot": (1.5708, 0.0000, 0.0000), "mirror": True},
    {"op": "spin", "name": "engineOuter", "rgb": (0.1559, 0.1779, 0.1620), "seg": 10, "profile": [(0.5, -3), (1.2, -2), (1.25, 2), (0.8, 3)], "loc": (15, -0.4, 1), "rot": (1.5708, 0.0000, 0.0000), "mirror": True},
    {"op": "spin", "name": "rotodome", "rgb": (0.2705, 0.2918, 0.2664), "seg": 18, "profile": [(0.1, -0.5), (4.6, -0.45), (5.2, 0), (4.6, 0.45), (0.1, 0.5)], "loc": (0, 4.6, 2), "rot": (0.0000, 0.0000, 0.0600)},
    {"op": "plate", "name": "domePylon", "rgb": (0.1070, 0.1248, 0.1119), "outline": [(-0.5, -1.2), (0.5, -1.2), (0.5, 1.2), (-0.5, 1.2)], "th": 2.6, "span": 1, "dihedral": 0, "loc": (0, 3.3, 2)},
  ],
  "cruise": [  # CRUISE MISSILE
    {"op": "spin", "name": "body", "rgb": (0.2747, 0.2961, 0.2789), "seg": 12, "profile": [(0.04, -3.1), (0.3, -2.6), (0.32, 2.4), (0.24, 3)], "rot": (1.5708, 0.0000, 0.0000)},
    {"op": "plate", "name": "wing", "rgb": (0.2016, 0.2195, 0.2051), "outline": [(0.2, -0.6), (1.5, -0.3), (1.5, 0.25), (0.2, 0.5)], "th": 0.1, "span": 1.5, "dihedral": 0, "mirror": True},
    {"op": "plate", "name": "tail", "rgb": (0.2016, 0.2195, 0.2051), "outline": [(0.1, 2.1), (0.9, 2.4), (0.9, 2.9), (0.1, 2.8)], "th": 0.09, "span": 0.9, "dihedral": 0, "mirror": True},
    {"op": "spin", "name": "exhaust", "rgb": (1.0000, 0.4342, 0.1170), "seg": 8, "profile": [(0.2, -0.1), (0.12, 0.7), (0.04, 1.6)], "loc": (0, 0, 3.2), "rot": (1.5708, 0.0000, 0.0000), "emit": 1.6, "rough": 0.4, "metal": 0.0},
  ],
  "sam": [  # SAM LAUNCHER
    {"op": "loft", "name": "hull", "rgb": (0.1144, 0.1441, 0.0844), "seg": 8, "sections": [{"z": -4.2, "w": 1.3, "h": 0.8, "y": 0}, {"z": -2, "w": 1.5, "h": 1, "y": 0}, {"z": 2.6, "w": 1.5, "h": 1, "y": 0}, {"z": 4.4, "w": 1.2, "h": 0.8, "y": 0}]},
    {"op": "plate", "name": "deck", "rgb": (0.0762, 0.0976, 0.0630), "outline": [(-1.6, -3.8), (1.6, -3.8), (1.6, 4.2), (-1.6, 4.2)], "th": 0.3, "span": 1.6, "dihedral": 0, "loc": (0, 1, 0)},
    {"op": "spin", "name": "tube", "rgb": (0.1470, 0.1779, 0.1170), "seg": 8, "profile": [(0.3, -3), (0.34, 2.6), (0.3, 3)], "loc": (0.75, 2.1, 0.4), "rot": (-0.4500, 0.0000, 0.0000), "mirror": True},
    {"op": "spin", "name": "wheel", "rgb": (0.0452, 0.0561, 0.0423), "seg": 8, "profile": [(0.2, -0.3), (0.62, -0.25), (0.62, 0.25), (0.2, 0.3)], "loc": (1.5, 0.5, -2.4), "rot": (0.0000, 0.0000, 1.5708), "mirror": True},
    {"op": "spin", "name": "wheelRear", "rgb": (0.0452, 0.0561, 0.0423), "seg": 8, "profile": [(0.2, -0.3), (0.62, -0.25), (0.62, 0.25), (0.2, 0.3)], "loc": (1.5, 0.5, 2.4), "rot": (0.0000, 0.0000, 1.5708), "mirror": True},
  ],
  "radar": [  # SEARCH RADAR
    {"op": "loft", "name": "truck", "rgb": (0.0999, 0.1195, 0.0782), "seg": 8, "sections": [{"z": -3.4, "w": 1.2, "h": 0.9, "y": 0}, {"z": -1, "w": 1.4, "h": 1.1, "y": 0}, {"z": 3, "w": 1.4, "h": 1.1, "y": 0}, {"z": 4, "w": 1.1, "h": 0.8, "y": 0}]},
    {"op": "plate", "name": "dish", "rgb": (0.2664, 0.3005, 0.2270), "outline": [(-3.2, -0.5), (3.2, -0.5), (2.4, 0.5), (-2.4, 0.5)], "th": 0.25, "span": 3.2, "dihedral": 0, "loc": (0, 3.6, 0.6), "rot": (1.1500, 0.0000, 0.0000)},
    {"op": "plate", "name": "mast", "rgb": (0.0685, 0.0844, 0.0561), "outline": [(-0.3, -0.3), (0.3, -0.3), (0.3, 0.3), (-0.3, 0.3)], "th": 2.6, "span": 0.3, "dihedral": 0, "loc": (0, 2.3, 0.6)},
    {"op": "spin", "name": "wheel", "rgb": (0.0331, 0.0395, 0.0284), "seg": 8, "profile": [(0.2, -0.3), (0.6, -0.25), (0.6, 0.25), (0.2, 0.3)], "loc": (1.4, 0.5, -1.8), "rot": (0.0000, 0.0000, 1.5708), "mirror": True},
    {"op": "spin", "name": "wheelRear", "rgb": (0.0331, 0.0395, 0.0284), "seg": 8, "profile": [(0.2, -0.3), (0.6, -0.25), (0.6, 0.25), (0.2, 0.3)], "loc": (1.4, 0.5, 2), "rot": (0.0000, 0.0000, 1.5708), "mirror": True},
  ],
  "bus": [  # CIVILIAN BUS
    {"op": "loft", "name": "body", "rgb": (0.6867, 0.5841, 0.2747), "seg": 8, "sections": [{"z": -5, "w": 1.3, "h": 1.4, "y": 0}, {"z": -3.6, "w": 1.45, "h": 1.6, "y": 0}, {"z": 3.8, "w": 1.45, "h": 1.6, "y": 0}, {"z": 5, "w": 1.3, "h": 1.4, "y": 0}]},
    {"op": "plate", "name": "glass", "rgb": (0.0252, 0.0423, 0.0513), "outline": [(-1.4, -4.6), (1.4, -4.6), (1.4, -3.4), (-1.4, -3.4)], "th": 0.9, "span": 1.4, "dihedral": 0, "loc": (0, 1.4, 0), "alpha": 0.62, "rough": 0.12, "metal": 0.85},
    {"op": "spin", "name": "wheel", "rgb": (0.0232, 0.0232, 0.0212), "seg": 8, "profile": [(0.2, -0.28), (0.56, -0.22), (0.56, 0.22), (0.2, 0.28)], "loc": (1.4, 0.55, -3), "rot": (0.0000, 0.0000, 1.5708), "mirror": True},
    {"op": "spin", "name": "wheelRear", "rgb": (0.0232, 0.0232, 0.0212), "seg": 8, "profile": [(0.2, -0.28), (0.56, -0.22), (0.56, 0.22), (0.2, 0.28)], "loc": (1.4, 0.55, 3.2), "rot": (0.0000, 0.0000, 1.5708), "mirror": True},
  ],
  "truck": [  # SUPPLY TRUCK
    {"op": "loft", "name": "cab", "rgb": (0.1441, 0.1620, 0.0999), "seg": 8, "sections": [{"z": -3.4, "w": 1.15, "h": 1, "y": 0}, {"z": -2.2, "w": 1.25, "h": 1.2, "y": 0}, {"z": -1, "w": 1.25, "h": 1.2, "y": 0}]},
    {"op": "plate", "name": "bed", "rgb": (0.1070, 0.1248, 0.0802), "outline": [(-1.3, -0.8), (1.3, -0.8), (1.3, 3.6), (-1.3, 3.6)], "th": 1.5, "span": 1.3, "dihedral": 0, "loc": (0, 1.4, 0)},
    {"op": "spin", "name": "wheel", "rgb": (0.0232, 0.0232, 0.0212), "seg": 8, "profile": [(0.18, -0.26), (0.52, -0.2), (0.52, 0.2), (0.18, 0.26)], "loc": (1.25, 0.5, -2.4), "rot": (0.0000, 0.0000, 1.5708), "mirror": True},
    {"op": "spin", "name": "wheelRear", "rgb": (0.0232, 0.0232, 0.0212), "seg": 8, "profile": [(0.18, -0.26), (0.52, -0.2), (0.52, 0.2), (0.18, 0.26)], "loc": (1.25, 0.5, 2.4), "rot": (0.0000, 0.0000, 1.5708), "mirror": True},
  ],
}

for key, parts in AIRFRAMES.items():
    build(key, parts)
print("AeroForge: %d airframes built" % len(AIRFRAMES))