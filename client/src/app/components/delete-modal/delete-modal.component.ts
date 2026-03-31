import { Component, Input, Output, EventEmitter } from '@angular/core';
import { CommonModule } from '@angular/common';

@Component({
  selector: 'app-delete-modal',
  standalone: true,
  imports: [CommonModule],
  template: `
    <div class="modal-overlay" *ngIf="isOpen" (click)="onCancel()">
      <div class="modal" (click)="$event.stopPropagation()">
        <h3 class="modal-title" style="color:var(--color-danger);">
          <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" style="vertical-align:middle;margin-right:8px;">
            <path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"/>
            <line x1="12" y1="9" x2="12" y2="13"/><line x1="12" y1="17" x2="12.01" y2="17"/>
          </svg>
          Delete "{{ title }}"?
        </h3>

        <div class="modal-body">
          <p style="margin-bottom:12px;">This will permanently remove this {{ mediaType }} from:</p>
          <ul style="list-style:none;padding:0;">
            <li *ngFor="let item of deleteTargets" style="padding:4px 0;display:flex;align-items:center;gap:8px;">
              <span style="width:6px;height:6px;border-radius:50%;background:var(--color-danger);flex-shrink:0;"></span>
              {{ item }}
            </li>
          </ul>
          <p style="margin-top:16px;color:var(--color-danger);font-weight:500;">This action cannot be undone.</p>
        </div>

        <div class="modal-actions">
          <button class="btn btn-secondary" (click)="onCancel()" id="delete-cancel-btn">Cancel</button>
          <button
            class="btn btn-danger"
            (click)="onConfirm()"
            [disabled]="isDeleting"
            id="delete-confirm-btn"
          >
            <span *ngIf="isDeleting" class="spinner"></span>
            {{ isDeleting ? 'Deleting...' : 'Delete Everywhere' }}
          </button>
        </div>
      </div>
    </div>
  `,
})
export class DeleteModalComponent {
  @Input() isOpen = false;
  @Input() title = '';
  @Input() mediaType = 'media';
  @Input() deleteTargets: string[] = [];
  @Input() isDeleting = false;
  @Output() confirm = new EventEmitter<void>();
  @Output() cancel = new EventEmitter<void>();

  onConfirm() {
    this.confirm.emit();
  }

  onCancel() {
    if (!this.isDeleting) {
      this.cancel.emit();
    }
  }
}
