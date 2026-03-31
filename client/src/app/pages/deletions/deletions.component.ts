import { Component, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { ApiService } from '../../services/api.service';

@Component({
  selector: 'app-deletions',
  standalone: true,
  imports: [CommonModule],
  templateUrl: './deletions.component.html',
  styleUrl: './deletions.component.css'
})
export class DeletionsComponent implements OnInit {
  logs: any[] = [];
  total: number = 0;
  limit: number = 50;
  offset: number = 0;
  isLoading: boolean = false;

  constructor(private api: ApiService) {}

  ngOnInit() {
    this.loadLogs();
  }

  loadLogs() {
    this.isLoading = true;
    this.api.getDeletionLogs(this.limit, this.offset).subscribe({
      next: (data) => {
        this.logs = data.logs || [];
        this.total = data.total || 0;
        this.isLoading = false;
      },
      error: (err) => {
        console.error('Failed to load deletion logs', err);
        this.isLoading = false;
      }
    });
  }

  nextPage() {
    if (this.offset + this.limit < this.total) {
      this.offset += this.limit;
      this.loadLogs();
    }
  }

  prevPage() {
    if (this.offset - this.limit >= 0) {
      this.offset -= this.limit;
      this.loadLogs();
    }
  }

  formatSize(bytes: number): string {
    if (!bytes) return '0 B';
    const units = ['B', 'KB', 'MB', 'GB', 'TB'];
    let i = 0;
    let size = bytes;
    while (size >= 1024 && i < units.length - 1) { size /= 1024; i++; }
    return `${size.toFixed(1)} ${units[i]}`;
  }
}
