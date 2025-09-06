import { ComponentFixture, TestBed } from '@angular/core/testing';
import { HttpClientTestingModule } from '@angular/common/http/testing';
import { RouterTestingModule } from '@angular/router/testing';
import { ActivatedRoute } from '@angular/router';
import { FormsModule } from '@angular/forms';
import { UpdateEmployeeComponent } from './update-employee.component';

describe('UpdateEmployeeComponent', () => {
  let component: UpdateEmployeeComponent;
  let fixture: ComponentFixture<UpdateEmployeeComponent>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      declarations: [UpdateEmployeeComponent],
      imports: [
        HttpClientTestingModule,
        RouterTestingModule,
        FormsModule,
      ],
      providers: [
        // ton composant lit this.route.snapshot.params['id']
        { provide: ActivatedRoute, useValue: { snapshot: { params: { id: 1 } } } },
      ],
    }).compileComponents();

    fixture = TestBed.createComponent(UpdateEmployeeComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
