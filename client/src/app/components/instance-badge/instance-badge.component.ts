import { Component, Input } from '@angular/core';
import { CommonModule } from '@angular/common';

@Component({
  selector: 'app-instance-badge',
  standalone: true,
  imports: [CommonModule],
  template: `
    <span class="badge" [ngClass]="'badge-' + type">{{ name }}</span>
  `,
})
export class InstanceBadgeComponent {
  @Input() name = '';
  @Input() type = 'muted';
}
