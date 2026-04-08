const canvas = document.getElementById('puzzle-canvas');
const ctx = canvas.getContext('2d');
const loadingOverlay = document.getElementById('loading-overlay');
const previewModal = document.getElementById('preview-modal');

// Resize canvas
function resizeCanvas() {
    canvas.width = window.innerWidth;
    canvas.height = window.innerHeight;
}
window.addEventListener('resize', resizeCanvas);
resizeCanvas();

// UI Listeners
document.getElementById('previewBtn').addEventListener('click', () => previewModal.classList.remove('hidden'));
document.getElementById('closePreview').addEventListener('click', () => previewModal.classList.add('hidden'));

// --- PUZZLE LOGIC ---

// Configuration for roughly 1000 pieces
let COLS;
let ROWS; 

let image = new Image();
let pieces = [];
let groups = [];
let pieceWidth, pieceHeight;
let padding;

// Viewport / Camera state
let camera = { x: 0, y: 0, scale: 0.5 }; // Start zoomed out slightly

image.onload = () => {
    initPuzzle();
};
image.src = 'LUNALEIA.jpeg';

// Generate pieces
function initPuzzle() {
    // Dynamically calculate cols and rows to ensure puzzle pieces are as square as possible!
    const targetPieces = 1000;
    const aspectRatio = image.width / image.height;
    ROWS = Math.max(1, Math.round(Math.sqrt(targetPieces / aspectRatio)));
    COLS = Math.max(1, Math.round(aspectRatio * ROWS));

    // Determine piece dimensions based on image
    pieceWidth = image.width / COLS;
    pieceHeight = image.height / ROWS;
    
    // Padding needed to draw the interlocking tabs onto the offscreen canvas
    padding = Math.max(pieceWidth, pieceHeight) * 0.3;

    // Center puzzle initially
    camera.x = (window.innerWidth / 2) - ((image.width  * camera.scale) / 2);
    camera.y = (window.innerHeight / 2) - ((image.height * camera.scale) / 2);

    // Edges state matrix to guarantee interlocking fits
    // 1 = tab points right/down (outwards for top/left pieces, inwards for bottom/right pieces)
    // -1 = tab points left/up
    let horizontalEdges = []; // Right/Left edges
    let verticalEdges = [];   // Bottom/Top edges

    for(let r=0; r <= ROWS; r++) {
        let row = [];
        for(let c=0; c < COLS; c++) {
            row.push(Math.random() > 0.5 ? 1 : -1);
        }
        verticalEdges.push(row);
    }
    for(let r=0; r < ROWS; r++) {
        let row = [];
        for(let c=0; c <= COLS; c++) {
            row.push(Math.random() > 0.5 ? 1 : -1);
        }
        horizontalEdges.push(row);
    }

    // A large workspace spread area
    const spreadW = image.width * 2.5;
    const spreadH = image.height * 2.5;

    // Generate offscreen pieces
    for (let r=0; r<ROWS; r++) {
        for (let c=0; c<COLS; c++) {
            // Edges: 0 for straight border, 1/-1 for interlocking tabs
            let topType = (r === 0) ? 0 : verticalEdges[r][c]; // -topType to match direction logically
            let rightType = (c === COLS - 1) ? 0 : horizontalEdges[r][c+1];
            let bottomType = (r === ROWS - 1) ? 0 : -verticalEdges[r+1][c];
            let leftType = (c === 0) ? 0 : -horizontalEdges[r][c];

            const offCanvas = document.createElement('canvas');
            const cw = pieceWidth + padding * 2;
            const ch = pieceHeight + padding * 2;
            offCanvas.width = cw;
            offCanvas.height = ch;
            const octx = offCanvas.getContext('2d');

            // Draw jigsaw path
            octx.beginPath();
            octx.moveTo(padding, padding);
            drawEdge(octx, padding, padding, padding + pieceWidth, padding, topType);
            drawEdge(octx, padding + pieceWidth, padding, padding + pieceWidth, padding + pieceHeight, rightType);
            drawEdge(octx, padding + pieceWidth, padding + pieceHeight, padding, padding + pieceHeight, bottomType);
            drawEdge(octx, padding, padding + pieceHeight, padding, padding, leftType);
            octx.closePath();
            
            // Clip geometry and draw image chunk
            octx.clip();
            octx.drawImage(image, 
                c * pieceWidth - padding, r * pieceHeight - padding, cw, ch,
                0, 0, cw, ch
            );

            // Piece styling (shadows/borders for 3D realism)
            octx.lineWidth = 1;
            octx.strokeStyle = "rgba(0,0,0,0.5)";
            octx.stroke();

            // Create tracking object - Keep pieces strictly OUTSIDE the puzzle board border
            let px, py;
            let isInsideBoard = true;
            
            while(isInsideBoard) {
                px = (Math.random() * spreadW) - (spreadW / 2) + image.width / 2;
                py = (Math.random() * spreadH) - (spreadH / 2) + image.height / 2;
                
                // Define the board bounds with a clear margin so pieces don't spawn right on the edge
                const margin = Math.max(pieceWidth, pieceHeight) * 1.5;
                const insideX = px > -margin && px < image.width + margin;
                const insideY = py > -margin && py < image.height + margin;
                
                if (!(insideX && insideY)) {
                    isInsideBoard = false;
                }
            }
            
            let piece = {
                r: r, c: c,
                x: px, y: py,
                canvas: offCanvas
            };
            
            // Manage as a "Group" of 1 initially
            let group = {
                id: r * COLS + c,
                x: px, y: py,
                pieces: [piece]
            };
            piece.group = group;
            piece.offsetX = 0; // Relative to group center
            piece.offsetY = 0;

            pieces.push(piece);
            groups.push(group);
        }
    }

    // Hide loader and start render loop
    loadingOverlay.classList.add('hidden');
    requestAnimationFrame(renderLoop);
}

// Draw a jigsaw puzzle interlocking edge
function drawEdge(ctx, x1, y1, x2, y2, tabDirection) {
    if (tabDirection === 0) {
        ctx.lineTo(x2, y2);
        return;
    }
    const dx = x2 - x1;
    const dy = y2 - y1;
    const length = Math.hypot(dx, dy);
    
    ctx.save();
    ctx.translate(x1, y1);
    ctx.rotate(Math.atan2(dy, dx));
    
    // Base tab dimensions on the minimal side of the piece, not edge length!
    // This strictly prevents tabs from colliding on extremely rectangular pieces.
    const t = Math.min(pieceWidth, pieceHeight) * 0.28; 
    const s = t * -tabDirection; 
    const mid = length / 2;
    
    // Create a precise standard mushroom head
    ctx.lineTo(mid - t * 0.4, 0);
    ctx.bezierCurveTo(mid - t * 0.4, 0, mid - t * 1.1, s, mid, s);
    ctx.bezierCurveTo(mid + t * 1.1, s, mid + t * 0.4, 0, mid + t * 0.4, 0);
    ctx.lineTo(length, 0);
    
    ctx.restore();
}

// --- RENDER LOOP ---
function renderLoop() {
    ctx.clearRect(0, 0, canvas.width, canvas.height);

    ctx.save();
    ctx.translate(camera.x, camera.y);
    ctx.scale(camera.scale, camera.scale);

    // Puzzle Board Border and Guide
    // Draw a darker board mat background
    ctx.fillStyle = "rgba(0, 0, 0, 0.6)";
    ctx.fillRect(0, 0, image.width, image.height);
    
    // Draw the image faintly as a reference guide (makes the 1000 pieces much less agonizing)
    ctx.globalAlpha = 0.15;
    ctx.drawImage(image, 0, 0);
    ctx.globalAlpha = 1.0;

    // Draw a thick, sleek bounding box constraint border
    ctx.lineWidth = 4;
    ctx.strokeStyle = "rgba(56, 189, 248, 0.6)";
    ctx.strokeRect(-2, -2, image.width + 4, image.height + 4);

    // Render pieces
    for (const piece of pieces) {
        // Optimisation: Basic Viewport culling to maintain high FPS for 1000 pieces
        let scaledPx = piece.x * camera.scale + camera.x;
        let scaledPy = piece.y * camera.scale + camera.y;
        let scaledSizeW = pieceWidth * camera.scale;
        let scaledSizeH = pieceHeight * camera.scale;

        if (scaledPx + scaledSizeW < 0 || scaledPx > canvas.width || 
            scaledPy + scaledSizeH < 0 || scaledPy > canvas.height) {
            continue; // Skip rendering off-screen pieces
        }

        ctx.drawImage(piece.canvas, piece.x - padding, piece.y - padding);
    }
    
    ctx.restore();
    requestAnimationFrame(renderLoop);
}

// --- INTERACTIONS ---
let isPanning = false;
let isDragging = false;
let grabbedGroup = null;
let lastMouseX, lastMouseY;

// Map screen to workspace
function getWorkspaceCoords(e) {
    return {
        x: (e.clientX - camera.x) / camera.scale,
        y: (e.clientY - camera.y) / camera.scale
    };
}

canvas.addEventListener('mousedown', (e) => {
    // Middle click or right click = pan
    if (e.button === 1 || e.button === 2) {
        isPanning = true;
        lastMouseX = e.clientX;
        lastMouseY = e.clientY;
        canvas.style.cursor = "grabbing";
        return;
    }

    if (e.button === 0) {
        let ws = getWorkspaceCoords(e);
        
        // Find which piece was clicked. Traverse backwards to hit top pieces.
        for (let i = pieces.length - 1; i >= 0; i--) {
            let p = pieces[i];
            if (ws.x >= p.x && ws.x <= p.x + pieceWidth &&
                ws.y >= p.y && ws.y <= p.y + pieceHeight) {
                
                // Grab the entire group
                isDragging = true;
                grabbedGroup = p.group;
                lastMouseX = ws.x;
                lastMouseY = ws.y;

                // Bring group to front (reorder pieces array)
                const groupPieces = grabbedGroup.pieces;
                pieces = pieces.filter(piece => !groupPieces.includes(piece));
                pieces.push(...groupPieces);

                canvas.style.cursor = "grabbing";
                break;
            }
        }
        
        // If clicked empty space, initiate panning
        if (!isDragging) {
            isPanning = true;
            lastMouseX = e.clientX;
            lastMouseY = e.clientY;
            canvas.style.cursor = "grabbing";
        }
    }
});

canvas.addEventListener('mousemove', (e) => {
    if (isPanning) {
        let dx = e.clientX - lastMouseX;
        let dy = e.clientY - lastMouseY;
        camera.x += dx;
        camera.y += dy;
        lastMouseX = e.clientX;
        lastMouseY = e.clientY;
    } else if (isDragging && grabbedGroup) {
        let ws = getWorkspaceCoords(e);
        let dx = ws.x - lastMouseX;
        let dy = ws.y - lastMouseY;

        grabbedGroup.x += dx;
        grabbedGroup.y += dy;

        // Apply shift to all pieces in the group
        for (let p of grabbedGroup.pieces) {
            p.x += dx;
            p.y += dy;
        }

        lastMouseX = ws.x;
        lastMouseY = ws.y;
    }
});

window.addEventListener('mouseup', (e) => {
    isPanning = false;
    canvas.style.cursor = "default";
    
    if (isDragging && grabbedGroup) {
        isDragging = false;
        
        // --- SNAPPING LOGIC ---
        const SNAP_THRESHOLD = Math.max(pieceWidth, pieceHeight) * 0.2; // 20% snap distance allowing for forgiving linkage
        
        let groupsToMerge = new Set();
        let shiftX = 0, shiftY = 0;
        let snapped = false;

        // Check if any piece in grabbedGroup sits near its sibling in other groups
        for (let p1 of grabbedGroup.pieces) {
            for (let p2 of pieces) {
                if (p1.group === p2.group) continue;
                
                // Are they grid neighbors? (Sum of coordinate differences = 1)
                if (Math.abs(p1.r - p2.r) + Math.abs(p1.c - p2.c) === 1) {
                    
                    let expectedDx = (p1.c - p2.c) * pieceWidth;
                    let expectedDy = (p1.r - p2.r) * pieceHeight;
                    
                    let actualDx = p1.x - p2.x;
                    let actualDy = p1.y - p2.y;

                    if (Math.hypot(actualDx - expectedDx, actualDy - expectedDy) < SNAP_THRESHOLD) {
                        // Found a snap!
                        // Calculate perfect shift for p1 based on p2
                        let perfectX = p2.x + expectedDx;
                        let perfectY = p2.y + expectedDy;
                        
                        shiftX = perfectX - p1.x;
                        shiftY = perfectY - p1.y;

                        groupsToMerge.add(p2.group);
                        snapped = true;
                    }
                }
                if (snapped) break;
            }
            if (snapped) break;
        }

        if (snapped) {
            // Apply alignment shift to the entire grabbed group
            grabbedGroup.x += shiftX;
            grabbedGroup.y += shiftY;
            for (let p of grabbedGroup.pieces) {
                p.x += shiftX;
                p.y += shiftY;
            }

            // Merge grabbing group into the first target group it connected to
            let targetGroup = Array.from(groupsToMerge)[0];
            
            for (let p of grabbedGroup.pieces) {
                p.group = targetGroup;
                p.offsetX = p.x - targetGroup.x;
                p.offsetY = p.y - targetGroup.y;
                targetGroup.pieces.push(p);
            }

            // Clean up old grabbedGroup reference
            groups = groups.filter(g => g !== grabbedGroup);
            grabbedGroup = null;
            
            if(targetGroup.pieces.length === pieces.length) {
                setTimeout(() => alert("Masterpiece Complete! You matched 1000 pieces seamlessly. 💖"), 200);
            }
        } else {
            grabbedGroup = null;
        }
    }
});

// Prevent context menu on right click to allow panning
window.addEventListener('contextmenu', e => e.preventDefault());

// Zoom logic
canvas.addEventListener('wheel', (e) => {
    e.preventDefault();
    const zoomIntensity = 0.05;
    const wheel = e.deltaY < 0 ? 1 : -1;
    let factor = Math.exp(wheel * zoomIntensity);
    
    let oldScale = camera.scale;
    camera.scale *= factor;
    // Bound limits 
    if (camera.scale < 0.1) camera.scale = 0.1;
    if (camera.scale > 3) camera.scale = 3;

    // Adjust camera.x and camera.y so that zoom originates from the mouse pointer!
    const mouseX = e.clientX;
    const mouseY = e.clientY;
    
    camera.x = mouseX - (mouseX - camera.x) * (camera.scale / oldScale);
    camera.y = mouseY - (mouseY - camera.y) * (camera.scale / oldScale);
}, { passive: false });