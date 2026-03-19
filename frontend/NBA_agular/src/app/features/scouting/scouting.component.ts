// src/app/features/scouting/scouting.component.ts

import { Component, OnInit, OnDestroy, ChangeDetectorRef } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { Router } from '@angular/router';
import { Subject, takeUntil } from 'rxjs';
import { PlayerService } from '../../services/player.service';

type SortDir = 'asc' | 'desc' | null;

@Component({
  selector: 'app-scouting',
  standalone: true,
  imports: [CommonModule, FormsModule],
  templateUrl: './scouting.component.html',
  styleUrl: './scouting.component.css'
})
export class ScoutingComponent implements OnInit, OnDestroy {

  // ── Données ───────────────────────────────────────────────────────────────
  columns:          string[]              = [];
  allPlayers:       Record<string, any>[] = [];
  filteredPlayers:  Record<string, any>[] = [];
  displayedPlayers: Record<string, any>[] = [];

  // ── Filtres par colonne ───────────────────────────────────────────────────
  columnFilters: Record<string, string> = {};

  // ── Tri ───────────────────────────────────────────────────────────────────
  sortCol: string  = '';
  sortDir: SortDir = null;

  // ── Pagination ────────────────────────────────────────────────────────────
  readonly PAGE_SIZE = 50;
  currentPage = 1;
  totalPages  = 1;

  // ── État ──────────────────────────────────────────────────────────────────
  loading = false;
  error   = '';

  private readonly HIDDEN_COLS = ['Rk', 'Awards', 'Player-additional'];
  private destroy$ = new Subject<void>();

  get visibleColumns(): string[] {
    return this.columns.filter(c => !this.HIDDEN_COLS.includes(c));
  }

  get slugCol(): string {
    return this.columns[1] ?? '';
  }

  get activeFilterCount(): number {
    return Object.values(this.columnFilters)
      .filter(v => v != null && v.trim() !== '').length;
  }

  constructor(
    private playerService: PlayerService,
    private router: Router,
    private cdr: ChangeDetectorRef,
  ) {}

  goBack() {
    this.router.navigate(['/home']);
  }

  ngOnInit() {
    this.fetchPlayers();
  }

  ngOnDestroy() {
    this.destroy$.next();
    this.destroy$.complete();
  }

  // ── Chargement initial (une seule fois) ───────────────────────────────────

  fetchPlayers() {
    this.loading = true;
    this.error   = '';
  
    this.playerService.getPlayers()
      .pipe(takeUntil(this.destroy$))
      .subscribe({
        next: (res) => {
          console.log('réponse reçue', res);        // <-- ajoute ça
          this.columns    = res.columns;
          this.allPlayers = res.players;
          this.applyFiltersAndSort();
          this.loading = false;
          console.log('loading =', this.loading);         // <-- ici
          console.log('displayed =', this.displayedPlayers.length);  // <-- et ici
          this.cdr.detectChanges();   // <-- force la mise à jour du template
        },
        error: (err) => {
          console.error('erreur HTTP', err);        // <-- et ça
          this.error   = 'Impossible de charger les joueurs.';
          this.loading = false;
        }
      }) ;
  }

  // ── trackbyindex ───────────────────────────
  trackByIndex(index: number): number {
    return index;
  }

  // ── Parsing et évaluation des filtres numériques ──────────────────────────

  private matchesFilter(cellValue: any, filterStr: string): boolean {
    const term = filterStr.trim();
    if (!term) return true;

    const num = parseFloat(String(cellValue));
    const isNumericCell = !isNaN(num);

    // Opérateur & (ET) — priorité sur |
    if (term.includes('&')) {
      return term.split('&').every(part => this.matchesFilter(cellValue, part.trim()));
    }

    // Opérateur | (OU)
    if (term.includes('|')) {
      return term.split('|').some(part => this.matchesFilter(cellValue, part.trim()));
    }

    // Opérateurs numériques
    if (isNumericCell) {
      const ops = [
        { op: '>=', fn: (v: number, t: number) => v >= t },
        { op: '<=', fn: (v: number, t: number) => v <= t },
        { op: '>',  fn: (v: number, t: number) => v > t  },
        { op: '<',  fn: (v: number, t: number) => v < t  },
        { op: '=',  fn: (v: number, t: number) => v === t },
      ];

      for (const { op, fn } of ops) {
        if (term.startsWith(op)) {
          const target = parseFloat(term.slice(op.length).trim());
          if (!isNaN(target)) return fn(num, target);
        }
      }
    }

    // Fallback : recherche texte (contains)
    return String(cellValue).toLowerCase().includes(term.toLowerCase());
  }
  // ── Filtrage + tri + pagination (100% frontend) ───────────────────────────

  applyFiltersAndSort() {
    let data = [...this.allPlayers];

    // 1. Filtres par colonne
    for (const [col, val] of Object.entries(this.columnFilters)) {
      if (!val || val.trim() === '') continue;
      data = data.filter(row => this.matchesFilter(row[col], val));
    }

    // 2. Tri
    if (this.sortCol && this.sortDir) {
      const dir = this.sortDir === 'asc' ? 1 : -1;
      const col = this.sortCol;
      data.sort((a, b) => {
        const av = a[col], bv = b[col];
        if (av == null) return 1;
        if (bv == null) return -1;
        const an = parseFloat(av), bn = parseFloat(bv);
        if (!isNaN(an) && !isNaN(bn)) return (an - bn) * dir;
        return String(av).localeCompare(String(bv)) * dir;
      });
    }

    // 3. Pagination
    this.filteredPlayers = data;
    this.totalPages      = Math.max(1, Math.ceil(data.length / this.PAGE_SIZE));
    this.currentPage     = Math.min(this.currentPage, this.totalPages);
    this.paginate();
  }

  private paginate() {
    const start = (this.currentPage - 1) * this.PAGE_SIZE;
    this.displayedPlayers = this.filteredPlayers.slice(start, start + this.PAGE_SIZE);
  }

  // ── Handlers filtres ──────────────────────────────────────────────────────

  onFilterChange() {
    this.currentPage = 1;
    this.applyFiltersAndSort();
  }

  resetFilters() {
    this.columnFilters = {};
    this.currentPage   = 1;
    this.applyFiltersAndSort();
  }

  // ── Tri ───────────────────────────────────────────────────────────────────

  sortBy(col: string) {
    if (this.sortCol === col) {
      this.sortDir = this.sortDir === 'asc' ? 'desc'
                  : this.sortDir === 'desc' ? null
                  : 'asc';
      if (!this.sortDir) this.sortCol = '';
    } else {
      this.sortCol = col;
      this.sortDir = 'asc';
    }
    this.currentPage = 1;
    this.applyFiltersAndSort();
  }

  sortIcon(col: string): string {
    if (this.sortCol !== col || !this.sortDir) return '↕';
    return this.sortDir === 'asc' ? '↑' : '↓';
  }

  // ── Pagination ────────────────────────────────────────────────────────────

  prevPage() {
    if (this.currentPage > 1) {
      this.currentPage--;
      this.paginate();
    }
  }

  nextPage() {
    if (this.currentPage < this.totalPages) {
      this.currentPage++;
      this.paginate();
    }
  }

  // ── Navigation ────────────────────────────────────────────────────────────

  goToProfile(player: Record<string, any>) {
    const slug = player[this.slugCol];
    if (slug) this.router.navigate(['/player', slug]);
  }

  // ── Utilitaires ──────────────────────────────────────────────────────────

  formatValue(val: any): string {
    if (val == null || val === '') return '—';
    return String(val);
  }
}