import { Injectable } from '@angular/core';
import { HttpClient, HttpParams } from '@angular/common/http';
import { Observable } from 'rxjs';

export interface Instance {
  id?: number;
  type: string;
  name: string;
  url: string;
  api_key: string;
  username?: string;
  password?: string;
  enabled?: boolean;
  last_sync?: string;
  created_at?: string;
}

export interface MediaItem {
  id: number;
  title: string;
  media_type: 'movie' | 'series';
  imdb_id?: string;
  tvdb_id?: string;
  tmdb_id?: string;
  poster_url?: string;
  overview?: string;
  year?: number;
  status: string;
  seeding_status: 'seeding' | 'done' | 'unknown';
  added_at?: string;
  last_watched_at?: string;
  instance_names?: string;
  instance_types?: string;
  total_size_bytes?: number;
  requests?: { name: string; avatar?: string }[];
}

export interface MediaListResponse {
  items: MediaItem[];
  total: number;
  limit: number;
  offset: number;
}

export interface MediaDetail extends MediaItem {
  instances: MediaInstanceDetail[];
  downloads: DownloadRecord[];
  watchHistory: WatchHistoryEntry[];
  requests: MediaRequest[];
}
 
export interface MediaRequest {
  id: number;
  media_item_id: number;
  external_id: number;
  requested_by_name: string;
  requested_by_avatar?: string;
  requested_by_id?: number;
  requested_at: string;
  type?: string;
  name: string;
  avatar?: string;
}

export interface MediaInstanceDetail {
  id: number;
  media_item_id: number;
  instance_id: number;
  external_id: number;
  external_slug?: string;
  instance_name: string;
  instance_type: string;
  instance_url: string;
  path?: string;
  size_bytes: number;
  has_file: boolean;
  quality?: string;
  date_added?: string;
}

export interface DownloadRecord {
  id: number;
  media_item_id: number;
  instance_name?: string;
  torrent_hash?: string;
  torrent_name?: string;
  ratio: number;
  ratio_limit: number;
  state: string;
  done_seeding: boolean;
  seeding_time_seconds: number;
  seeding_time_limit: number;
}

export interface WatchHistoryEntry {
  id: number;
  media_item_id: number;
  user_name: string;
  watched_at: string;
  duration_seconds: number;
  percent_complete: number;
  source: string;
}

export interface SyncStatus {
  isSyncing: boolean;
  recentLogs: SyncLogEntry[];
}

export interface SyncLogEntry {
  id: number;
  instance_id?: number;
  instance_name?: string;
  instance_type?: string;
  sync_type: string;
  status: string;
  message?: string;
  items_processed: number;
  started_at: string;
  completed_at?: string;
}

export interface TestConnectionResult {
  success: boolean;
  version?: string;
  error?: string;
  variant?: string;
  instanceName?: string;
  friendlyName?: string;
}

@Injectable({ providedIn: 'root' })
export class ApiService {
  private baseUrl = '/api';

  // Cache for preserving scroll state and items upon returning to dashboard
  public cachedDashboardState: any = null;
  public cameFromDashboard = false;

  constructor(private http: HttpClient) {}

  // ── Instances ──

  getInstances(): Observable<Instance[]> {
    return this.http.get<Instance[]>(`${this.baseUrl}/instances`);
  }

  createInstance(instance: Partial<Instance>): Observable<Instance> {
    return this.http.post<Instance>(`${this.baseUrl}/instances`, instance);
  }

  updateInstance(id: number, data: Partial<Instance>): Observable<Instance> {
    return this.http.put<Instance>(`${this.baseUrl}/instances/${id}`, data);
  }

  deleteInstance(id: number): Observable<any> {
    return this.http.delete(`${this.baseUrl}/instances/${id}`);
  }

  testInstance(id: number): Observable<TestConnectionResult> {
    return this.http.post<TestConnectionResult>(`${this.baseUrl}/instances/${id}/test`, {});
  }

  testInstanceUnsaved(data: Partial<Instance>): Observable<TestConnectionResult> {
    return this.http.post<TestConnectionResult>(`${this.baseUrl}/instances/test`, data);
  }

  getPlexPin(): Observable<{ id: number; code: string; clientIdentifier: string }> {
    return this.http.post<{ id: number; code: string; clientIdentifier: string }>(`${this.baseUrl}/instances/plex/pin`, {});
  }

  pollPlexPin(id: number): Observable<{ authToken: string | null }> {
    return this.http.get<{ authToken: string | null }>(`${this.baseUrl}/instances/plex/pin/${id}`);
  }

  getPlexServers(token: string): Observable<any[]> {
    return this.http.get<any[]>(`${this.baseUrl}/instances/plex/servers?token=${encodeURIComponent(token)}`);
  }

  // ── Media ──

  getMedia(params: {
    sort?: string;
    order?: string;
    mediaType?: string;
    seedingStatus?: string;
    watchStatus?: string;
    search?: string;
    requestedBy?: string;
    limit?: number;
    offset?: number;
  } = {}): Observable<MediaListResponse> {
    let httpParams = new HttpParams();
    Object.entries(params).forEach(([key, value]) => {
      if (value !== undefined && value !== null && value !== '') {
        httpParams = httpParams.set(key, String(value));
      }
    });
    return this.http.get<MediaListResponse>(`${this.baseUrl}/media`, { params: httpParams });
  }

  getMediaDetail(id: number): Observable<MediaDetail> {
    return this.http.get<MediaDetail>(`${this.baseUrl}/media/${id}`);
  }

  deleteMedia(id: number): Observable<any> {
    return this.http.delete(`${this.baseUrl}/media/${id}`);
  }

  // ── Sync ──

  triggerSync(): Observable<any> {
    return this.http.post(`${this.baseUrl}/sync`, {});
  }
 
  getRequesters(): Observable<{ requested_by_name: string; requested_by_avatar?: string; requested_by_id?: number }[]> {
    return this.http.get<{ requested_by_name: string; requested_by_avatar?: string; requested_by_id?: number }[]>(`${this.baseUrl}/media/requesters`);
  }
 
  getSyncStatus(): Observable<SyncStatus> {
    return this.http.get<SyncStatus>(`${this.baseUrl}/sync/status`);
  }

  // ── Settings ──

  getSettings(): Observable<Record<string, string>> {
    return this.http.get<Record<string, string>>(`${this.baseUrl}/settings`);
  }

  updateSettings(settings: Record<string, string>): Observable<Record<string, string>> {
    return this.http.put<Record<string, string>>(`${this.baseUrl}/settings`, settings);
  }

  // ── Health ──

  getHealth(): Observable<{ status: string; version: string }> {
    return this.http.get<{ status: string; version: string }>(`${this.baseUrl}/health`);
  }

  // ── Stats ──

  getStats(days: number = 30): Observable<any> {
    const timestamp = new Date().getTime(); // Add a unique timestamp to force a fresh request in addition to server headers
    return this.http.get<any>(`${this.baseUrl}/stats?days=${days}&t=${timestamp}`);
  }

  getDeletionLogs(limit: number = 100, offset: number = 0): Observable<any> {
    return this.http.get<any>(`${this.baseUrl}/stats/deletions?limit=${limit}&offset=${offset}`);
  }
}
