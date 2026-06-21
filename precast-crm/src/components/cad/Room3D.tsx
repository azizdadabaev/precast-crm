"use client";

import { useEffect, useRef } from "react";
import * as THREE from "three";
import { OrbitControls } from "three/examples/jsm/controls/OrbitControls.js";
import type { Rect } from "@/lib/cad/geometry";

/**
 * Read-only 3D preview of the precast floor: each room's BEAMS (concrete ribs)
 * and BLOCKS (in-fill modules) are rendered as individual extruded boxes — the
 * actual members, not a flat slab. Rects are world-cm from the scanline overlay
 * (so it works for rectilinear AND tapered rooms); the plan's (x, y) maps to
 * world (x, y) with Z up. three is lazy-loaded by the parent.
 */
export interface Room3DMesh {
  beams: Rect[];
  blocks: Rect[];
}

const BEAM_H_CM = 22; // beam rib height
const BLOCK_H_CM = 19; // block sits a touch lower so the ribs read
const BLOCK_PALETTE = [0xf6d8a8, 0xc7e9c0, 0xbcd6f5, 0xf3c4dd, 0xd7caf3, 0xb8ebf0];

export function Room3D({ data }: { data: Room3DMesh[] }) {
  const mountRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const mount = mountRef.current;
    if (!mount) return;
    const width = mount.clientWidth || 600;
    const height = mount.clientHeight || 420;

    const scene = new THREE.Scene();
    scene.background = new THREE.Color(0xf1f5f9);
    const camera = new THREE.PerspectiveCamera(45, width / height, 1, 400000);
    camera.up.set(0, 0, 1); // Z up so the plan reads as a floor
    const renderer = new THREE.WebGLRenderer({ antialias: true });
    renderer.setPixelRatio(window.devicePixelRatio);
    renderer.setSize(width, height);
    mount.appendChild(renderer.domElement);
    const controls = new OrbitControls(camera, renderer.domElement);
    controls.enableDamping = true;

    scene.add(new THREE.AmbientLight(0xffffff, 0.8));
    const dir = new THREE.DirectionalLight(0xffffff, 0.5);
    dir.position.set(0.4, -1, 1.3);
    scene.add(dir);

    // Unit box centred at the origin; scaled + placed per instance.
    const unit = new THREE.BoxGeometry(1, 1, 1);
    const m = new THREE.Matrix4();
    const place = (r: Rect, h: number) => {
      m.makeScale(Math.max(r.w, 0.1), Math.max(r.h, 0.1), h);
      m.setPosition(r.x + r.w / 2, r.y + r.h / 2, h / 2);
      return m;
    };

    const totalBeams = data.reduce((s, d) => s + d.beams.length, 0);
    const totalBlocks = data.reduce((s, d) => s + d.blocks.length, 0);
    let minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity;
    const grow = (r: Rect) => {
      minX = Math.min(minX, r.x); maxX = Math.max(maxX, r.x + r.w);
      minY = Math.min(minY, r.y); maxY = Math.max(maxY, r.y + r.h);
    };

    if (totalBeams > 0) {
      const beamMesh = new THREE.InstancedMesh(
        unit,
        new THREE.MeshLambertMaterial({ color: 0x9aa6b2 }),
        totalBeams,
      );
      let bi = 0;
      for (const d of data)
        for (const r of d.beams) {
          beamMesh.setMatrixAt(bi++, place(r, BEAM_H_CM));
          grow(r);
        }
      beamMesh.instanceMatrix.needsUpdate = true;
      scene.add(beamMesh);
    }

    if (totalBlocks > 0) {
      const blockMesh = new THREE.InstancedMesh(
        unit,
        new THREE.MeshLambertMaterial(),
        totalBlocks,
      );
      let bi = 0;
      data.forEach((d, ri) => {
        const col = new THREE.Color(BLOCK_PALETTE[ri % BLOCK_PALETTE.length]);
        for (const r of d.blocks) {
          blockMesh.setMatrixAt(bi, place(r, BLOCK_H_CM));
          blockMesh.setColorAt(bi, col);
          bi++;
          grow(r);
        }
      });
      blockMesh.instanceMatrix.needsUpdate = true;
      if (blockMesh.instanceColor) blockMesh.instanceColor.needsUpdate = true;
      scene.add(blockMesh);
    }

    const cx = isFinite(minX) ? (minX + maxX) / 2 : 0;
    const cy = isFinite(minY) ? (minY + maxY) / 2 : 0;
    const extent = isFinite(minX) ? Math.max(maxX - minX, maxY - minY, 100) : 400;

    const grid = new THREE.GridHelper(extent * 3, 24, 0xcbd5e1, 0xe2e8f0);
    grid.rotation.x = Math.PI / 2;
    grid.position.set(cx, cy, -0.5);
    scene.add(grid);

    controls.target.set(cx, cy, BEAM_H_CM / 2);
    camera.position.set(cx + extent, cy - extent, extent * 0.85);
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
  }, [data]);

  return <div ref={mountRef} className="h-full w-full" />;
}
