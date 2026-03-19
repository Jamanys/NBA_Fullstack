// src/app/services/player.service.ts

import { Injectable } from '@angular/core';
import { HttpClient, HttpParams } from '@angular/common/http';
import { Observable } from 'rxjs';

export interface PlayersResponse {
  count: number;
  columns: string[];
  players: Record<string, any>[];
}

export interface ScatterPoint {
  [key: string]: string | number | null;
}

export interface ScatterResponse {
  numeric_columns: string[];
  x: string;
  y: string;
  points: ScatterPoint[];
}

export interface SourceData {
  columns: string[];
  data: Record<string, any>;
}

export interface PlayerProfileResponse {
  slug: string;
  name: string;
  sources: {
    players_stats:     SourceData;
    advanced_stats:    SourceData;
    shooting:          SourceData;
    adjusted_shooting: SourceData;
  };
}

// Ajoute cette interface
export interface StatPercentile {
  value:      number;
  percentile: number;
  min:        number;
  max:        number;
}

export interface PercentilesResponse {
  slug: string;
  sources: {
    players_stats:     Record<string, StatPercentile>;
    advanced_stats:    Record<string, StatPercentile>;
    shooting:          Record<string, StatPercentile>;
    adjusted_shooting: Record<string, StatPercentile>;
  };
}

@Injectable({ providedIn: 'root' })
export class PlayerService {

  private readonly apiUrl = 'https://nbafullstack-production.up.railway.app';

  constructor(private http: HttpClient) {}
  

  getPlayers(): Observable<PlayersResponse> {
    return this.http.get<PlayersResponse>(`${this.apiUrl}/players`);
  }

  getPlayerProfile(slug: string): Observable<PlayerProfileResponse> {
    return this.http.get<PlayerProfileResponse>(
      `${this.apiUrl}/players/${encodeURIComponent(slug)}`
    );
  }

  getScatterData(x: string, y: string): Observable<ScatterResponse> {
    const params = new HttpParams().set('x', x).set('y', y);
    return this.http.get<ScatterResponse>(`${this.apiUrl}/team/scatter`, { params });
  }

  // Ajoute cette méthode dans PlayerService
  getPlayerPercentiles(slug: string): Observable<PercentilesResponse> {
    return this.http.get<PercentilesResponse>(
      `${this.apiUrl}/players/percentiles/${encodeURIComponent(slug)}`
    );
  }
}