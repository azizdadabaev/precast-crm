"use client";

import { useEffect, useRef } from "react";
import * as THREE from "three";
import { OrbitControls } from "three/examples/jsm/controls/OrbitControls.js";
import type { RoomShape } from "@/lib/cad/geometry";

/**
 * Read-only 3D preview: extrudes each closed room polygon (with its floor voids
 * as holes) into a coloured slab and lets the operator orbit/pan/zoom. cm units;
 * the plan's (x, y) maps to world (x, y) with Z up. three is loaded only when
 * this component mounts (the parent lazy-imports it).
 */
const PALETTE = [0x60a5fa, 0x34d399, 0xf59e0b, 0xf472b6, 0xa78bfa, 0x22d3ee];
const SLAB_CM = 24;

export function Room3D({ rooms }: { rooms: RoomShape[]; wallThickCm?: number }) {
  const mountRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const mount = mountRef.current;
    if (!mount) return;
    const width = mount.clientWidth || 600;
    const height = mount.clientHeight || 420;

    const scene = new THREE.Scene();
    scene.background = new THREE.Color(0xf1f5f9);

    const camera = new THREE.PerspectiveCamera(45, width / height, 1, 200000);
    camera.up.set(0, 0, 1); // Z up so the plan reads as a floor

    const renderer = new THREE.WebGLRenderer({ antialias: true });
    renderer.setPixelRatio(window.devicePixelRatio);
    renderer.setSize(width, height);
    mount.appendChild(renderer.domElement);

    const controls = new OrbitControls(camera, renderer.domElement);
    controls.enableDamping = true;

    scene.add(new THREE.AmbientLight(0xffffff, 0.75));
    const dir = new THREE.DirectionalLight(0xffffff, 0.55);
    dir.position.set(0.5, -1, 1.2);
    scene.add(dir);

    const closed = rooms.filter((r) => r.closed && r.points.length >= 3);
    const group = new THREE.Group();
    let minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity;

    closed.forEach((room, idx) => {
      const shape = new THREE.Shape(room.points.map((p) => new THREE.Vector2(p.x, p.y)));
      for (const h of room.holes ?? []) {
        if (h.length >= 3) {
          shape.holes.push(new THREE.Path(h.map((p) => new THREE.Vector2(p.x, p.y))));
        }
      }
      const geom = new THREE.ExtrudeGeometry(shape, { depth: SLAB_CM, bevelEnabled: false });
      const mesh = new THREE.Mesh(
        geom,
        new THREE.MeshLambertMaterial({ color: PALETTE[idx % PALETTE.length] }),
      );
      group.add(mesh);
      const edges = new THREE.LineSegments(
        new THREE.EdgesGeometry(geom),
        new THREE.LineBasicMaterial({ color: 0x334155 }),
      );
      group.add(edges);
      for (const p of room.points) {
        minX = Math.min(minX, p.x); maxX = Math.max(maxX, p.x);
        minY = Math.min(minY, p.y); maxY = Math.max(maxY, p.y);
      }
    });
    scene.add(group);

    const cx = isFinite(minX) ? (minX + maxX) / 2 : 0;
    const cy = isFinite(minY) ? (minY + maxY) / 2 : 0;
    const extent = isFinite(minX)
      ? Math.max(maxX - minX, maxY - minY, 100)
      : 400;

    // Ground grid in the XY plane (rotate the default XZ helper).
    const grid = new THREE.GridHelper(extent * 3, 24, 0xcbd5e1, 0xe2e8f0);
    grid.rotation.x = Math.PI / 2;
    grid.position.set(cx, cy, -0.5);
    scene.add(grid);

    controls.target.set(cx, cy, SLAB_CM / 2);
    camera.position.set(cx + extent, cy - extent, extent * 0.9);
    controls.update();

    let raf = 0;
    const animate = () => {
      controls.update();
      renderer.render(scene, camera);
      raf = requestAnimationFrame(animate);
    };
    animate();

    const onResize = () => {
      const w = mount.clientWidth || 600;
      const h = mount.clientHeight || 420;
      camera.aspect = w / h;
      camera.updateProjectionMatrix();
      renderer.setSize(w, h);
    };
    window.addEventListener("resize", onResize);

    return () => {
      cancelAnimationFrame(raf);
      window.removeEventListener("resize", onResize);
      controls.dispose();
      renderer.dispose();
      if (renderer.domElement.parentNode === mount) mount.removeChild(renderer.domElement);
    };
  }, [rooms]);

  return <div ref={mountRef} className="h-full w-full" />;
}
