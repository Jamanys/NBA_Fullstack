// src/app/features/player-profile/player-profile.component.ts

import { Component, OnInit, OnDestroy, ChangeDetectorRef, AfterViewInit, ViewChildren, QueryList, ElementRef } from '@angular/core';
import { CommonModule } from '@angular/common';
import { ActivatedRoute, Router } from '@angular/router';
import { Subject, forkJoin, takeUntil } from 'rxjs';
import { PlayerService, PlayerProfileResponse, PercentilesResponse, StatPercentile } from '../../services/player.service';

interface RadarStat {
  label:      string;
  value:      number;
  percentile: number;
  min:        number;
  max:        number;
  color:      string;
}

interface CategoryChart {
  key:   string;
  label: string;
  stats: RadarStat[];
}

@Component({
  selector: 'app-player-profile',
  standalone: true,
  imports: [CommonModule],
  templateUrl: './player-profile.component.html',
  styleUrl: './player-profile.component.css'
})
export class PlayerProfileComponent implements OnInit, OnDestroy, AfterViewInit {

  @ViewChildren('pizzaCanvas') canvasRefs!: QueryList<ElementRef<HTMLCanvasElement>>;

  profile:     PlayerProfileResponse | null = null;
  percentiles: PercentilesResponse   | null = null;
  charts:      CategoryChart[]              = [];
  activeSection = 0;
  loading = true;
  error   = '';

  private destroy$ = new Subject<void>();
  private canvasReady = false;

  readonly SOURCE_LABELS: Record<string, string> = {
    players_stats:     'Stats générales',
    advanced_stats:    'Stats avancées',
    shooting:          'Tirs',
    adjusted_shooting: 'Tirs ajustés',
  };

  constructor(
    private route:         ActivatedRoute,
    private router:        Router,
    private playerService: PlayerService,
    private cdr:           ChangeDetectorRef,
  ) {}

  ngOnInit() {
    this.route.paramMap
      .pipe(takeUntil(this.destroy$))
      .subscribe(params => {
        const slug = params.get('slug');
        if (!slug) { this.router.navigate(['/scouting']); return; }
        this.loadAll(slug);
      });
  }

  ngAfterViewInit() {
    this.canvasReady = true;
    // Si les données sont déjà là, dessine maintenant
    if (this.charts.length > 0) this.drawAllCharts();
  }

  ngOnDestroy() {
    this.destroy$.next();
    this.destroy$.complete();
  }

  // ── Chargement ────────────────────────────────────────────────────────────

  private loadAll(slug: string) {
    this.loading = true;
    this.error   = '';

    forkJoin({
      profile:     this.playerService.getPlayerProfile(slug),
      percentiles: this.playerService.getPlayerPercentiles(slug),
    })
    .pipe(takeUntil(this.destroy$))
    .subscribe({
      next: ({ profile, percentiles }) => {
        this.profile     = profile;
        this.percentiles = percentiles;
        this.charts      = this.buildCharts(percentiles);
        this.loading     = false;
        this.cdr.detectChanges();
        // Attend que les canvas soient dans le DOM
        setTimeout(() => this.drawAllCharts(), 50);
      },
      error: (err) => {
        this.error   = err.status === 404 ? 'Joueur introuvable.' : 'Impossible de charger le profil.';
        this.loading = false;
        this.cdr.detectChanges();
      }
    });
  }

  // ── Construction des charts ───────────────────────────────────────────────

  private percentileColor(p: number): string {
    if (p >= 90) return '#7F77DD';       // top 10% — violet
    if (p >= 70) return '#1D9E75';       // top 30% — vert
    if (p <= 10) return '#A32D2D';       // bottom 10% — rouge foncé
    if (p <= 30) return '#D85A30';       // bottom 30% — orangé
    return '#888780';                     // neutre — gris
  }

  private buildCharts(res: PercentilesResponse): CategoryChart[] {
    return Object.entries(res.sources).map(([key, stats]) => ({
      key,
      label: this.SOURCE_LABELS[key] ?? key,
      stats: Object.entries(stats).map(([statName, s]: [string, StatPercentile]) => ({
        label:      statName,
        value:      s.value,
        percentile: s.percentile,
        min:        s.min,
        max:        s.max,
        color:      this.percentileColor(s.percentile),
      })),
    }));
  }

  // ── Dessin des pizza charts ───────────────────────────────────────────────

  private drawAllCharts() {
    const canvases = this.canvasRefs?.toArray() ?? [];
    // Il n'y a toujours qu'un seul canvas visible (celui de l'onglet actif)
    const canvas = canvases[0];
    if (canvas && this.charts[this.activeSection]) {
      this.drawPizza(canvas.nativeElement, this.charts[this.activeSection].stats);
    }
  }

  private drawPizza(canvas: HTMLCanvasElement, stats: RadarStat[]) {
    const ctx    = canvas.getContext('2d');
    if (!ctx || stats.length === 0) return;

    const dpr    = window.devicePixelRatio || 1;
    const size   = canvas.clientWidth || 260;
    canvas.width  = size * dpr;
    canvas.height = size * dpr;
    ctx.scale(dpr, dpr);

    const cx      = size / 2;
    const cy      = size / 2;
    const outerR  = size * 0.38;
    const innerR  = size * 0.14;
    const n       = stats.length;
    const sliceA  = (Math.PI * 2) / n;
    const gap     = 0.04;                 // gap entre les tranches (radians)
    const isDark  = window.matchMedia('(prefers-color-scheme: dark)').matches;
    const bgTrack = isDark ? 'rgba(255,255,255,0.06)' : 'rgba(0,0,0,0.06)';
    const textCol = isDark ? '#c2c0b6' : '#3d3d3a';

    ctx.clearRect(0, 0, size, size);

    stats.forEach((stat, i) => {
      const startA = -Math.PI / 2 + i * sliceA + gap / 2;
      const endA   = startA + sliceA - gap;
      const filled = innerR + (outerR - innerR) * (stat.percentile / 100);

      // Track (fond gris)
      ctx.beginPath();
      ctx.moveTo(cx + innerR * Math.cos(startA), cy + innerR * Math.sin(startA));
      ctx.arc(cx, cy, outerR, startA, endA);
      ctx.arc(cx, cy, innerR, endA, startA, true);
      ctx.closePath();
      ctx.fillStyle = bgTrack;
      ctx.fill();

      // Tranche colorée (percentile)
      ctx.beginPath();
      ctx.moveTo(cx + innerR * Math.cos(startA), cy + innerR * Math.sin(startA));
      ctx.arc(cx, cy, filled, startA, endA);
      ctx.arc(cx, cy, innerR, endA, startA, true);
      ctx.closePath();
      ctx.fillStyle = stat.color;
      ctx.fill();

      // Label court (abréviation)
      const labelR  = outerR + 18;
      const midA    = startA + (sliceA - gap) / 2;
      const lx      = cx + labelR * Math.cos(midA);
      const ly      = cy + labelR * Math.sin(midA);
      const short   = this.shortLabel(stat.label);

      ctx.fillStyle   = textCol;
      ctx.font        = `500 ${size * 0.052}px -apple-system, sans-serif`;
      ctx.textAlign   = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText(short, lx, ly);

      // Valeur percentile au centre de la tranche
      const valR = (innerR + filled) / 2;
      const vx   = cx + valR * Math.cos(midA);
      const vy   = cy + valR * Math.sin(midA);
      if (filled - innerR > 14) {
        ctx.fillStyle    = 'rgba(255,255,255,0.85)';
        ctx.font         = `500 ${size * 0.042}px -apple-system, sans-serif`;
        ctx.textAlign    = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText(`${Math.round(stat.percentile)}`, vx, vy);
      }
    });

    // Cercle central — valeur active
    ctx.beginPath();
    ctx.arc(cx, cy, innerR - 2, 0, Math.PI * 2);
    ctx.fillStyle = isDark ? '#1a1a1a' : '#fff';
    ctx.fill();
  }

  private shortLabel(label: string): string {
    const map: Record<string, string> = {
      'PTS': 'PTS', 'AST': 'AST', 'TRB': 'REB', 'STL': 'STL',
      'BLK': 'BLK', 'FG%': 'FG%', 'PER': 'PER', 'TS%': 'TS%',
      'USG%': 'USG', 'WS': 'WS', 'BPM': 'BPM', 'VORP': 'VORP',
      '% of FGA by Distance | 2P': '2P%', '% of FGA by Distance | 3P': '3P%',
      'FG% by Distance | 2P': 'FG2', 'FG% by Distance | 3P': 'FG3',
      'Corner 3s | 3P%': 'C3%', '% of FG Ast\'d | 3P': 'A3%',
      'Shooting % | FG%': 'FG%', 'Shooting % | 3P%': '3P%',
      'Shooting % | 2P%': '2P%', 'Shooting % | FT%': 'FT%',
      'League-Adjusted | FG%': 'aFG', 'League-Adjusted | 3P%': 'a3P',
    };
    return map[label] ?? label.split(' | ').pop()?.slice(0, 4) ?? label.slice(0, 4);
  }

  // ── Navigation ────────────────────────────────────────────────────────────

  selectSection(i: number) {
    this.activeSection = i;
    this.cdr.detectChanges();          // force le DOM à créer le nouveau canvas
    setTimeout(() => this.drawAllCharts(), 0);  // dessine après que le canvas est dans le DOM
  }

  goBack() { this.router.navigate(['/scouting']); }

  get playerMeta() {
    const data = this.profile?.sources?.players_stats?.data ?? {};
    return {
      player: data['Player'] ?? '—',
      team:   data['Team']   ?? '—',
      pos:    data['Pos']    ?? '—',
      age:    data['Age']    ?? '—',
    };
  }
}