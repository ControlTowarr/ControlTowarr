import { ComponentFixture, TestBed } from '@angular/core/testing';

import { DeletionsComponent } from './deletions.component';

describe('DeletionsComponent', () => {
  let component: DeletionsComponent;
  let fixture: ComponentFixture<DeletionsComponent>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [DeletionsComponent]
    })
    .compileComponents();

    fixture = TestBed.createComponent(DeletionsComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
