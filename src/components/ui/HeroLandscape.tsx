import React from 'react';
import { motion } from 'motion/react';

const CloudOne = ({ className, opacity = 1 }: { className?: string, opacity?: number }) => (
  <svg width="1530" height="658" viewBox="0 0 1530.379324 658.570155" preserveAspectRatio="xMidYMid meet" className={className} style={{ opacity }}>
    <g transform="translate(-236.566275,1408.624533) scale(0.100000,-0.100000)" fill="currentColor" stroke="none">
      <path d="M10375 14074 c-313 -38 -539 -103 -792 -225 -137 -67 -333 -189 -443 -276 -184 -146 -404 -391 -533 -595 -65 -102 -161 -310 -206 -443 -24 -71 -47 -134 -52 -139 -4 -4 -52 3 -106 18 -380 100 -792 30 -1125 -191 -95 -63 -292 -259 -352 -350 -26 -40 -53 -73 -61 -73 -7 0 -37 11 -67 24 -231 102 -610 151 -870 112 -578 -87 -1039 -418 -1296 -932 -61 -122 -93 -230 -133 -446 -7 -37 -16 -73 -19 -79 -5 -7 -30 -3 -81 15 -190 64 -365 96 -529 96 -610 -1 -1158 -427 -1312 -1020 -32 -123 -33 -129 -32 -345 0 -233 6 -274 66 -450 103 -301 358 -593 644 -738 351 -179 714 -216 1039 -108 224 74 367 163 535 334 86 88 80 88 185 18 200 -132 453 -225 745 -272 99 -16 396 -16 485 0 268 48 483 132 678 265 58 40 102 64 110 60 6 -5 46 -39 87 -76 235 -215 585 -391 935 -471 424 -98 779 -103 1180 -18 182 39 275 67 426 132 270 115 441 219 621 377 117 103 158 129 158 102 0 -25 115 -192 177 -256 266 -276 703 -433 1100 -396 237 23 428 84 658 212 30 16 60 30 67 30 8 0 51 -32 97 -71 154 -129 274 -203 448 -273 353 -142 735 -164 1068 -63 371 113 663 317 860 600 33 47 65 86 70 87 6 0 37 -16 70 -36 263 -160 550 -251 898 -285 132 -13 287 -2 439 32 323 71 662 239 877 435 343 312 528 678 572 1129 81 832 -429 1595 -1246 1863 -210 70 -350 92 -569 92 -145 0 -211 -8 -385 -45 -61 -13 -76 -14 -86 -3 -7 7 -18 58 -24 113 -47 379 -194 708 -459 1026 -221 263 -578 500 -877 579 -16 4 -57 15 -90 25 -190 53 -543 72 -730 39 -196 -34 -387 -102 -498 -178 -21 -14 -42 -26 -47 -26 -5 0 -37 42 -71 93 -126 187 -309 390 -454 503 -132 103 -349 229 -490 285 -11 4 -36 14 -55 23 -101 43 -304 104 -420 126 -226 44 -585 59 -785 34z"/>
    </g>
  </svg>
);

const CloudTwo = ({ className, opacity = 1 }: { className?: string, opacity?: number }) => (
  <svg width="1346" height="620" viewBox="0 0 1346.379538 620.762028" preserveAspectRatio="xMidYMid meet" className={className} style={{ opacity }}>
    <g transform="translate(-324.378075,1384.827674) scale(0.100000,-0.100000)" fill="currentColor" stroke="none">
      <path d="M8621 13834 c-330 -40 -749 -199 -1008 -381 -215 -152 -397 -318 -539 -493 -122 -150 -232 -341 -311 -540 -98 -249 -135 -422 -148 -705 -3 -65 -9 -123 -14 -128 -5 -5 -22 -2 -39 7 -17 9 -77 28 -134 43 -90 24 -122 27 -248 27 -127 0 -157 -3 -245 -28 -191 -53 -321 -124 -440 -241 -136 -133 -208 -243 -257 -395 -43 -129 -57 -183 -64 -248 -4 -36 -12 -66 -19 -68 -7 -3 -41 4 -76 16 -143 47 -254 63 -439 63 -144 0 -191 -3 -265 -21 -249 -59 -434 -152 -642 -325 -273 -225 -452 -578 -484 -952 -42 -497 168 -985 546 -1268 69 -52 279 -163 340 -180 11 -3 45 -13 75 -22 260 -75 510 -82 680 -19 l70 26 42 -48 c113 -132 192 -191 325 -245 71 -29 88 -32 188 -33 124 0 173 12 295 75 149 77 274 221 331 382 16 45 29 83 29 84 0 10 28 -2 65 -27 201 -138 426 -166 621 -75 166 76 208 118 313 305 16 29 50 21 177 -43 230 -115 376 -165 604 -209 95 -18 149 -22 315 -21 200 0 237 5 425 49 203 48 477 171 565 255 29 27 55 49 59 49 4 0 37 -29 73 -64 117 -115 239 -158 380 -136 37 6 70 7 75 2 4 -4 15 -41 24 -82 41 -198 121 -334 258 -436 157 -118 336 -166 498 -133 145 29 272 98 382 207 l74 74 83 -40 c236 -112 385 -152 569 -152 176 0 340 37 506 115 188 87 325 198 455 365 34 44 68 80 76 80 8 0 42 -26 74 -57 117 -112 246 -185 399 -225 73 -19 111 -22 265 -23 157 0 190 3 260 23 105 29 223 88 318 157 78 57 112 66 128 35 4 -8 24 -59 44 -113 43 -113 90 -179 175 -241 121 -89 280 -129 422 -106 142 22 240 79 338 197 24 29 50 53 58 53 7 0 32 -11 55 -24 55 -31 184 -75 272 -92 301 -59 666 86 885 350 184 222 273 516 241 794 -26 221 -88 386 -208 547 -124 167 -328 317 -516 380 -374 124 -740 56 -1020 -190 l-97 -85 -53 39 c-136 103 -345 147 -502 106 -109 -28 -111 -2 -12 205 88 185 135 386 144 610 17 449 -129 847 -452 1224 -122 143 -357 319 -560 419 -176 87 -330 135 -575 179 -117 21 -471 18 -590 -5 -262 -51 -514 -147 -665 -255 -155 -111 -249 -186 -327 -264 -64 -64 -90 -83 -97 -74 -5 6 -15 43 -21 81 -31 202 -58 298 -147 525 -58 145 -105 236 -197 375 -254 383 -652 693 -1100 859 -329 122 -741 171 -1085 130z"/>
    </g>
  </svg>
);

const InteractiveCloud = ({ children, className }: { children: React.ReactNode, className?: string }) => (
  <motion.div
    drag
    dragConstraints={{ left: -150, right: 150, top: -50, bottom: 50 }}
    dragElastic={0.4}
    whileHover={{ scale: 1.03, cursor: 'grab' }}
    whileDrag={{ scale: 1.08, cursor: 'grabbing' }}
    className={`absolute pointer-events-auto z-20 ${className}`}
  >
    {children}
  </motion.div>
);

export default function HeroLandscape() {
  return (
    <div className="absolute inset-x-0 bottom-0 top-0 overflow-hidden pointer-events-none select-none z-0">
      {/* ── CLOUDS ── */}
      {/* Background Cloud Layer (Slower) */}
      <div className="absolute inset-x-0 top-[-5%] h-[300px] animate-cloud-slow text-[#1F4C63]">
        <InteractiveCloud className="top-10 left-[5%]">
          <CloudOne className="w-64 h-auto" opacity={0.15} />
        </InteractiveCloud>
        
        <InteractiveCloud className="top-[2%] left-[45%]">
          <CloudTwo className="w-48 h-auto" opacity={0.10} />
        </InteractiveCloud>
        
        <InteractiveCloud className="top-[15%] left-[85%]">
          <CloudOne className="w-72 h-auto" opacity={0.12} />
        </InteractiveCloud>
      </div>

      {/* Foreground Cloud Layer (Faster) */}
      <div className="absolute inset-x-0 top-[2%] h-[300px] animate-cloud text-[#1F4C63]">
        <InteractiveCloud className="top-5 left-[25%]">
          <CloudTwo className="w-56 h-auto" opacity={0.25} />
        </InteractiveCloud>
        
        <InteractiveCloud className="top-[18%] left-[70%]">
          <CloudOne className="w-80 h-auto" opacity={0.20} />
        </InteractiveCloud>
        
        <InteractiveCloud className="top-[5%] left-[105%]">
          <CloudTwo className="w-40 h-auto" opacity={0.15} />
        </InteractiveCloud>
      </div>

      {/* ── LOWERED GRASSY HILL & SOIL LAYER ── */}
      <div className="absolute inset-x-[-10vw] bottom-[-20px] h-[140px] flex items-end justify-center pointer-events-none">
        <img 
          src="/landscape-block.png" 
          alt="Landscape Earth Block" 
          className="w-full h-full object-cover object-bottom min-w-[1400px]" 
        />
      </div>
    </div>
  );
}
