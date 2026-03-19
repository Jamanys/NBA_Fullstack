// frontend/src/app/features/team-profiles/team-profiles.component.ts
import {
    Component, OnInit, OnDestroy, ViewChild,
    ElementRef, AfterViewInit,ChangeDetectorRef
  } from '@angular/core';
  import { ActivatedRoute, Router } from '@angular/router';
  import { CommonModule } from '@angular/common';
  import { FormsModule } from '@angular/forms';
  import { Chart, ScatterController, LinearScale, PointElement, Tooltip } from 'chart.js';
  import { PlayerService, ScatterResponse } from '../../services/player.service';
  import { Subject, takeUntil } from 'rxjs';
  
  Chart.register(ScatterController, LinearScale, PointElement, Tooltip);
  
  interface Point {
    x: number;
    y: number;
    team: string;
    label: string;  // nom joueur, pour le tooltip interne
  }
  
  @Component({
    selector: 'app-team-profiles',
    standalone: true,
    imports: [CommonModule, FormsModule],
    templateUrl: './team-profiles.component.html',
    styleUrl: './team-profiles.component.css'
  })
  export class TeamProfilesComponent implements OnInit, AfterViewInit, OnDestroy {
  
    @ViewChild('chartCanvas') canvasRef!: ElementRef<HTMLCanvasElement>;
  
    // Données
    numericColumns: string[] = [];
    selectedX = '';
    selectedY = '';
    pointCount = 0;
    loading = false;
    error = '';
  
    private chart: Chart<'scatter', Point[]> | null = null;
    private destroy$ = new Subject<void>();
  
    // Couleurs par équipe (générées dynamiquement)
    private teamColors = new Map<string, string>();
    private palette = [
      '#7F77DD', '#1D9E75', '#D85A30', '#378ADD',
      '#BA7517', '#D4537E', '#639922', '#E24B4A',
      '#888780', '#0F6E56', '#993C1D', '#185FA5',
    ];
  
    constructor(
      private playerService: PlayerService,
      private router:        Router,
      private cdr: ChangeDetectorRef,
    ) {}
  
    ngOnInit() {
      // Charge les colonnes disponibles avec des axes par défaut
      this.playerService.getScatterData('PTS', 'AST')
        .pipe(takeUntil(this.destroy$))
        .subscribe({
          next: (res) => {
            this.numericColumns = res.numeric_columns;
            this.selectedX = res.x;
            this.selectedY = res.y;
            this.buildChart(res);
            this.cdr.detectChanges();
          },
          error: () => { this.error = 'Impossible de charger les données.';this.cdr.detectChanges(); }
        });
    }
  
    ngAfterViewInit() {}
  
    ngOnDestroy() {
      this.destroy$.next();
      this.destroy$.complete();
      this.chart?.destroy();
    }

    goBack() {
      this.router.navigate(['/home']);
    }
  
    onAxesChange() {
      if (!this.selectedX || !this.selectedY) return;
      this.loading = true;
      this.error = '';
  
      this.playerService.getScatterData(this.selectedX, this.selectedY)
        .pipe(takeUntil(this.destroy$))
        .subscribe({
          next: (res) => {
            this.updateChart(res);
            this.loading = false;
            this.cdr.detectChanges();
          },
          error: () => {
            this.error = 'Erreur lors du chargement.';
            this.loading = false;
            this.cdr.detectChanges();
          }
        });
    }
    private buildPoints(res: ScatterResponse): Point[] {
      const slugCol  = Object.keys(res.points[0] ?? {})[1] ?? '';
      return res.points.map(p => ({
        x:     p[res.x] as number,
        y:     p[res.y] as number,
        team:  (p['Team'] ?? p['team'] ?? '?') as string,
        label: (p['Player'] ?? p[slugCol] ?? '') as string,
      }));
    }
  
    private buildDatasets(points: Point[]) {
      return [{
        label: 'Players',
        data: points,
        pointStyle: (ctx: any) => {
          const pt = ctx.raw as Point;
          return this.getLogoImage(pt.team);
        },
        pointRadius: 10,         // taille du logo
        pointHoverRadius: 14,
      }];
    }
  
    private buildChart(res: ScatterResponse) {
      if (!this.canvasRef) return;
      const points = this.buildPoints(res);
      this.pointCount = points.length;
  
      this.chart = new Chart(this.canvasRef.nativeElement, {
        type: 'scatter',
        data: { datasets: this.buildDatasets(points) },
        options: this.chartOptions(res.x, res.y),
      });
    }
  
    private updateChart(res: ScatterResponse) {
      const points = this.buildPoints(res);
      this.pointCount = points.length;
  
      if (!this.chart) {
        this.buildChart(res);
        return;
      }
  
      this.chart.data.datasets = this.buildDatasets(points);
      this.chart.options = this.chartOptions(res.x, res.y);
      this.chart.update();
    }
  
    private chartOptions(xLabel: string, yLabel: string) {
      return {
        responsive: true,
        maintainAspectRatio: false,
        aspectRatio: 1/1,
        animation: { duration: 1000 },
        plugins: {
          legend: { display: false },
          tooltip: {
            callbacks: {
              label: (ctx: any) => {
                const pt = ctx.raw as Point;
                return [
                  `${pt.team}`,
                  `${xLabel}: ${pt.x}`,
                  `${yLabel}: ${pt.y}`,
                ];
              },
            },
            backgroundColor: '#1a1a1a',
            titleColor: '#fff',
            bodyColor: '#ccc',
            padding: 10,
            cornerRadius: 8,
            displayColors: false,
          },
        },
        scales: {
          x: {
            title: { display: true, text: xLabel, color: '#888', font: { size: 12 } },
            grid:  { color: 'rgba(128,128,128,0.1)' },
            ticks: { color: '#888' },
          },
          y: {
            title: { display: true, text: yLabel, color: '#888', font: { size: 12 } },
            grid:  { color: 'rgba(128,128,128,0.1)' },
            ticks: { color: '#888' },
          },
        },
      };
    }

    private teamColorMap: Record<string, string> = {
      ATL: '#E03A3E',
      BOS: '#007A33',
      BKN: '#000000',
      CHA: '#1D1160',
      CHI: '#CE1141',
      CLE: '#6F263D',
      DAL: '#00538C',
      DEN: '#0E2240',
      DET: '#0E2240',
      GSW: '#1D428A',
      HOU: '#CE1141',
      IND: '#002D62',
      LAC: '#C8102E',
      LAL: '#552583',
      MEM: '#5D76A9',
      MIA: '#98002E',
      MIL: '#00471B',
      MIN: '#0C2340',
      NOP: '#0C2340',
      NYK: '#006BB6',
      OKC: '#007AC1',
      ORL: '#0077C0',
      PHI: '#006BB6',
      PHX: '#1D1160',
      POR: '#E03A3E',
      SAC: '#5A2D81',
      SAS: '#C4CED4',
      TOR: '#CE1141',
      UTA: '#002B5C',
      WAS: '#002B5C',
    };

    private getTeamColor(team: string): string {
      const code = this.teamNameToCode[team] || team.substring(0, 3).toUpperCase();
      return this.teamColorMap[code] || '#888';
    }

    private logoCache = new Map<string, HTMLImageElement>();

    private getLogoImage(team: string): HTMLImageElement {
      console.log(team)
      const code = this.teamNameToCode[team] || team.substring(0, 3).toUpperCase();
    
      if (this.logoCache.has(code)) {
        return this.logoCache.get(code)!;
      }
    
      const img = new Image();
      console.log(code)
      img.src = `assets/NBA_logo/${code}.png`;
      img.width = 40;
      img.height = 40;
    
      this.logoCache.set(code, img);
      return img;
    }

    private teamNameToCode: Record<string, string> = {
      "Los Angeles Lakers": "LAL",
      "Los Angeles Clippers": "LAC",
      "Sacramento Kings": "SAC",
      "Phoenix Suns": "PHX",
      "Golden State Warriors": "GSW",

      "Houston Rockets": "HOU",
      "Dallas Mavericks": "DAL",
      "San Antonio Spurs": "SAS",
      "Oklahoma City Thunder": "OKC",
      "New Orleans Pelicans": "NOP",

      "Denver Nuggets": "DEN",
      "Portland Trail Blazzers": "POR",
      "Utah Jazz": "UTA",
      "Memphis Grizzlies": "MEM",
      "Minnesota Timberwolves": "MIN",

      "New York Knicks": "NYK",
      "Boston Celtics": "BOS",
      "Toronto Raptors": "TOR",
      "Philadelphia 76ers": "PHI",
      "Brooklyn Nets": "BKN",

      "Milwaukee Bucks": "MIL",
      "Detroit Pistons": "DET",
      "Indiana Pacers": "IND",
      "Chigago Bulls": "CHI",
      "Cleveland Cavaliers": "CLE",

      "Altanta Hawks": "ATL",
      "Orlando Magic": "ORL",
      "Charlotte Hornets": "CHA",
      "Washington Wizards": "WAS",
      "Miami Heat": "MIA",
    };
  }