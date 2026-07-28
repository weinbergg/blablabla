"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import * as THREE from "three";
import { OrbitControls } from "three/examples/jsm/controls/OrbitControls.js";
import { CSS2DObject, CSS2DRenderer } from "three/examples/jsm/renderers/CSS2DRenderer.js";
import { ArrowUpRight, Pause, Pin, Play, RotateCcw, X } from "lucide-react";
import type { GraphEdge, GraphNode } from "@/lib/db/queries";
import { buildCategoryAuthorTree, countLeaves, type GraphTreeNode } from "@/lib/graph-tree";

const CATEGORY_COLOR = 0xc85c35;
const AUTHOR_COLOR = 0x8a5a9e;
const MAJOR_RADIUS = 5.6;
const MINOR_RADIUS = 2.1;
const HEIGHT = 640;

type Placed = {
  node: GraphNode;
  depth: number;
  position: THREE.Vector3;
  normal: THREE.Vector3;
};

/**
 * The torus is the point: it's a genus-1 surface whose fundamental group is
 * Z x Z — two genuinely independent loops. We use exactly those two loops for
 * something meaningful instead of decoration: going around the long way (θ)
 * moves between top-level subjects, going around the tube (φ) descends into
 * a subject's own subsections and authors. Two unrelated axes of the data,
 * living on two unrelated topological cycles of the same real object.
 */
function layoutTorus(nodes: GraphNode[], edges: GraphEdge[]): Placed[] {
  const roots = buildCategoryAuthorTree(nodes, edges);
  const out: Placed[] = [];
  const totalLeaves = roots.reduce((sum, r) => sum + countLeaves(r), 0) || 1;

  function torusPoint(theta: number, phi: number) {
    const tubeCenter = new THREE.Vector3(
      Math.cos(theta) * MAJOR_RADIUS,
      0,
      Math.sin(theta) * MAJOR_RADIUS,
    );
    const outward = new THREE.Vector3(Math.cos(theta), 0, Math.sin(theta));
    const normal = outward.clone().multiplyScalar(Math.cos(phi));
    normal.y = Math.sin(phi);
    const position = tubeCenter.clone().add(normal.clone().multiplyScalar(MINOR_RADIUS));
    return { position, normal };
  }

  function place(node: GraphTreeNode, thetaStart: number, thetaEnd: number, depth: number) {
    const theta = (thetaStart + thetaEnd) / 2;
    const phi = depth <= 1 ? 0 : Math.min(Math.PI * 0.92, (depth - 1) * 0.85);
    const { position, normal } = torusPoint(theta, phi);
    out.push({ node: node.node, depth, position, normal });
    if (!node.children.length) return;
    const leafCounts = node.children.map(countLeaves);
    const total = leafCounts.reduce((s, x) => s + x, 0) || 1;
    const span = thetaEnd - thetaStart;
    let cursor = thetaStart;
    node.children.forEach((child, i) => {
      const childSpan = span * (leafCounts[i] / total);
      place(child, cursor, cursor + childSpan, depth + 1);
      cursor += childSpan;
    });
  }

  let cursor = 0;
  roots.forEach((root) => {
    const span = (2 * Math.PI * countLeaves(root)) / totalLeaves;
    place(root, cursor, cursor + span, 1);
    cursor += span;
  });

  return out;
}

export function TorusView({ nodes, edges }: { nodes: GraphNode[]; edges: GraphEdge[] }) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const [pinnedNode, setPinnedNode] = useState<GraphNode | null>(null);
  const [autoRotate, setAutoRotate] = useState(true);
  const resetRef = useRef<() => void>(() => {});
  const controlsRef = useRef<OrbitControls | null>(null);

  const placed = useMemo(() => layoutTorus(nodes, edges), [nodes, edges]);
  const relationEdges = useMemo(() => edges.filter((e) => e.kind === "relation"), [edges]);
  const byId = useMemo(() => new Map(nodes.map((n) => [n.id, n])), [nodes]);

  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;
    const width = container.clientWidth;
    const height = HEIGHT;

    const scene = new THREE.Scene();
    const camera = new THREE.PerspectiveCamera(48, width / height, 0.1, 100);
    camera.position.set(0, 6.5, 11.5);

    const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
    renderer.setSize(width, height);
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    container.appendChild(renderer.domElement);

    const labelRenderer = new CSS2DRenderer();
    labelRenderer.setSize(width, height);
    labelRenderer.domElement.style.position = "absolute";
    labelRenderer.domElement.style.top = "0";
    labelRenderer.domElement.style.left = "0";
    labelRenderer.domElement.style.pointerEvents = "none";
    container.appendChild(labelRenderer.domElement);

    const controls = new OrbitControls(camera, renderer.domElement);
    controls.enableDamping = true;
    controls.dampingFactor = 0.08;
    controls.minDistance = 6;
    controls.maxDistance = 24;
    controls.autoRotate = true;
    controls.autoRotateSpeed = 0.6;
    controlsRef.current = controls;

    scene.add(new THREE.AmbientLight(0xffffff, 1.1));
    const light = new THREE.DirectionalLight(0xffffff, 0.6);
    light.position.set(6, 10, 6);
    scene.add(light);

    const torusGeometry = new THREE.TorusGeometry(MAJOR_RADIUS, MINOR_RADIUS, 48, 120);
    const torusMaterial = new THREE.MeshStandardMaterial({
      color: 0xf7f4ed,
      transparent: true,
      opacity: 0.16,
      roughness: 0.9,
      metalness: 0,
      side: THREE.DoubleSide,
    });
    const torusMesh = new THREE.Mesh(torusGeometry, torusMaterial);
    scene.add(torusMesh);
    const wireframe = new THREE.LineSegments(
      new THREE.WireframeGeometry(new THREE.TorusGeometry(MAJOR_RADIUS, MINOR_RADIUS, 16, 48)),
      new THREE.LineBasicMaterial({ color: 0x191f28, transparent: true, opacity: 0.06 }),
    );
    scene.add(wireframe);

    const nodeGroup = new THREE.Group();
    scene.add(nodeGroup);
    const meshByNodeId = new Map<string, THREE.Mesh>();
    const pinRing = new THREE.Mesh(
      new THREE.RingGeometry(1, 1.25, 32),
      new THREE.MeshBasicMaterial({ color: 0xc85c35, transparent: true, opacity: 0.7, side: THREE.DoubleSide }),
    );
    pinRing.visible = false;
    scene.add(pinRing);

    for (const item of placed) {
      const isAuthor = item.node.type === "author";
      const radius = isAuthor ? 0.11 : 0.16 + Math.min(0.16, (item.node.documentCount ?? 0) / 60);
      const geometry = new THREE.SphereGeometry(radius, 20, 20);
      const material = new THREE.MeshStandardMaterial({
        color: isAuthor ? AUTHOR_COLOR : CATEGORY_COLOR,
        roughness: 0.45,
        metalness: 0.05,
      });
      const mesh = new THREE.Mesh(geometry, material);
      mesh.position.copy(item.position);
      mesh.userData.nodeId = item.node.id;
      nodeGroup.add(mesh);
      meshByNodeId.set(item.node.id, mesh);

      const showLabel = !isAuthor && item.depth <= 2;
      if (showLabel) {
        const div = document.createElement("div");
        div.textContent = item.node.label;
        div.style.fontFamily = "var(--font-serif, serif)";
        div.style.fontWeight = "600";
        div.style.fontSize = item.depth === 1 ? "13px" : "11px";
        div.style.color = "#191f28";
        div.style.textShadow = "0 0 6px #f7f4ed, 0 0 6px #f7f4ed, 0 0 6px #f7f4ed";
        div.style.whiteSpace = "nowrap";
        div.style.transform = "translate(10px, -6px)";
        const label = new CSS2DObject(div);
        mesh.add(label);
      }
    }

    const positionByNodeId = new Map(placed.map((p) => [p.node.id, p.position]));
    const linesGroup = new THREE.Group();
    scene.add(linesGroup);
    for (const edge of relationEdges) {
      const a = positionByNodeId.get(edge.source);
      const b = positionByNodeId.get(edge.target);
      if (!a || !b) continue;
      const mid = a.clone().add(b).multiplyScalar(0.5).multiplyScalar(1.35);
      const curve = new THREE.QuadraticBezierCurve3(a, mid, b);
      const points = curve.getPoints(24);
      const geometry = new THREE.BufferGeometry().setFromPoints(points);
      const material = new THREE.LineDashedMaterial({
        color: CATEGORY_COLOR,
        dashSize: 0.12,
        gapSize: 0.08,
        transparent: true,
        opacity: 0.55,
      });
      const line = new THREE.Line(geometry, material);
      line.computeLineDistances();
      linesGroup.add(line);
    }

    const raycaster = new THREE.Raycaster();
    const pointer = new THREE.Vector2();
    let hoveredId: string | null = null;

    function updatePointer(event: PointerEvent) {
      const rect = renderer.domElement.getBoundingClientRect();
      pointer.x = ((event.clientX - rect.left) / rect.width) * 2 - 1;
      pointer.y = -((event.clientY - rect.top) / rect.height) * 2 + 1;
    }

    function pickNodeId(): string | null {
      raycaster.setFromCamera(pointer, camera);
      const hits = raycaster.intersectObjects(nodeGroup.children, false);
      return hits.length ? (hits[0].object.userData.nodeId as string) : null;
    }

    let downAt: { x: number; y: number } | null = null;
    function handlePointerMove(event: PointerEvent) {
      updatePointer(event);
      hoveredId = pickNodeId();
      renderer.domElement.style.cursor = hoveredId ? "pointer" : "grab";
    }
    function handlePointerDown(event: PointerEvent) {
      downAt = { x: event.clientX, y: event.clientY };
    }
    function handlePointerUp(event: PointerEvent) {
      if (!downAt) return;
      const moved = Math.hypot(event.clientX - downAt.x, event.clientY - downAt.y);
      downAt = null;
      if (moved > 4) return;
      updatePointer(event);
      const id = pickNodeId();
      if (!id) {
        setPinnedNode(null);
        pinRing.visible = false;
        return;
      }
      const found = placed.find((p) => p.node.id === id)?.node ?? null;
      setPinnedNode((current) => {
        const next = current?.id === id ? null : found;
        if (next) {
          const mesh = meshByNodeId.get(id);
          if (mesh) {
            pinRing.visible = true;
            pinRing.position.copy(mesh.position);
            pinRing.lookAt(camera.position);
            const scale = (mesh.geometry as THREE.SphereGeometry).parameters.radius * 1.9;
            pinRing.scale.setScalar(scale);
          }
        } else {
          pinRing.visible = false;
        }
        return next;
      });
    }

    renderer.domElement.addEventListener("pointermove", handlePointerMove);
    renderer.domElement.addEventListener("pointerdown", handlePointerDown);
    renderer.domElement.addEventListener("pointerup", handlePointerUp);

    let frame = 0;
    function animate() {
      frame = requestAnimationFrame(animate);
      if (pinRing.visible) pinRing.lookAt(camera.position);
      controls.update();
      renderer.render(scene, camera);
      labelRenderer.render(scene, camera);
    }
    animate();

    resetRef.current = () => {
      camera.position.set(0, 6.5, 11.5);
      controls.target.set(0, 0, 0);
      controls.update();
    };

    function handleResize() {
      if (!container) return;
      const w = container.clientWidth;
      camera.aspect = w / height;
      camera.updateProjectionMatrix();
      renderer.setSize(w, height);
      labelRenderer.setSize(w, height);
    }
    window.addEventListener("resize", handleResize);

    return () => {
      cancelAnimationFrame(frame);
      window.removeEventListener("resize", handleResize);
      renderer.domElement.removeEventListener("pointermove", handlePointerMove);
      renderer.domElement.removeEventListener("pointerdown", handlePointerDown);
      renderer.domElement.removeEventListener("pointerup", handlePointerUp);
      controls.dispose();
      renderer.dispose();
      container.removeChild(renderer.domElement);
      container.removeChild(labelRenderer.domElement);
    };
  }, [placed, relationEdges]);

  return (
    <div className="overflow-hidden rounded-3xl border border-ink/10 bg-[#f7f4ed]">
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-ink/10 px-5 py-3.5">
        <div className="flex flex-wrap items-center gap-4 text-xs text-muted">
          <span className="inline-flex items-center gap-1.5">
            <span className="size-2.5 rounded-full" style={{ backgroundColor: "#c85c35" }} />
            раздел каталога
          </span>
          <span className="inline-flex items-center gap-1.5">
            <span className="size-2.5 rounded-full" style={{ backgroundColor: "#8a5a9e" }} />
            автор / текст
          </span>
        </div>
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() =>
              setAutoRotate((current) => {
                const next = !current;
                if (controlsRef.current) controlsRef.current.autoRotate = next;
                return next;
              })
            }
            className="icon-button"
            aria-label={autoRotate ? "Остановить вращение" : "Включить вращение"}
          >
            {autoRotate ? <Pause size={14} /> : <Play size={14} />}
          </button>
          <button type="button" onClick={() => resetRef.current()} className="icon-button" aria-label="Сбросить вид">
            <RotateCcw size={14} />
          </button>
        </div>
      </div>

      <div className="relative">
        {pinnedNode && (
          <div className="absolute right-4 top-4 z-10 w-[min(280px,calc(100%-2rem))] rounded-2xl border border-ink/10 bg-white/95 p-4 shadow-lg backdrop-blur">
            <div className="mb-2 flex items-start justify-between gap-2">
              <div>
                <p
                  className="text-[10px] font-semibold uppercase tracking-widest"
                  style={{ color: pinnedNode.type === "author" ? "#8a5a9e" : "#c85c35" }}
                >
                  <Pin size={10} className="mr-1 inline" />
                  {pinnedNode.type === "author"
                    ? pinnedNode.notable
                      ? "Автор"
                      : "Текст"
                    : "Раздел каталога"}
                </p>
                <p className="mt-1 font-serif text-lg leading-tight">{pinnedNode.label}</p>
              </div>
              <button type="button" onClick={() => setPinnedNode(null)} className="icon-button shrink-0" aria-label="Открепить">
                <X size={14} />
              </button>
            </div>
            {typeof pinnedNode.documentCount === "number" && (
              <p className="mb-3 text-xs text-muted">
                {pinnedNode.documentCount} {pinnedNode.documentCount === 1 ? "текст" : "текстов"} в разделе
              </p>
            )}
            {pinnedNode.href && (
              <Link href={pinnedNode.href} className="inline-flex items-center gap-1.5 text-sm font-medium text-rust transition-colors hover:text-ink">
                Перейти на страницу
                <ArrowUpRight size={15} />
              </Link>
            )}
          </div>
        )}

        <div ref={containerRef} style={{ height: HEIGHT }} className="relative w-full" />
      </div>

      <p className="border-t border-ink/10 px-5 py-3 text-center text-xs text-muted">
        Тор — поверхность с двумя независимыми циклами: вдоль большого круга разделяются темы,
        вдоль малого — раскрывается вложенность внутри темы. Перетаскивание вращает вид, колесо —
        приближает, клик по точке — закрепляет карточку.
      </p>

      {relationEdges.length > 0 && (
        <div className="border-t border-ink/10 bg-white/50 p-5 md:p-6">
          <p className="mb-4 text-xs font-semibold uppercase tracking-widest text-muted">Смысловые связи</p>
          <div className="grid gap-2.5 sm:grid-cols-2">
            {relationEdges.map((edge, index) => {
              const source = byId.get(edge.source);
              const target = byId.get(edge.target);
              if (!source || !target) return null;
              return (
                <button
                  type="button"
                  key={index}
                  onClick={() => setPinnedNode(source)}
                  className="rounded-xl border border-ink/10 bg-white/70 px-4 py-3 text-left text-sm transition-colors hover:border-rust/40"
                >
                  <span className="font-medium text-ink">{source.label}</span>
                  <span className="px-1.5 text-rust">↔</span>
                  <span className="font-medium text-ink">{target.label}</span>
                  {edge.label && <span className="block text-xs text-muted">{edge.label}</span>}
                </button>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}
