import { ComponentFixture, TestBed } from '@angular/core/testing';
import { RouterTestingModule } from '@angular/router/testing';
import { ActivatedRoute } from '@angular/router';
import { of } from 'rxjs';

import { ShowDetailsComponent } from './show-details.component';
import { EmployeeService } from '../employee.service';

describe('ShowDetailsComponent', () => {
  let component: ShowDetailsComponent;
  let fixture: ComponentFixture<ShowDetailsComponent>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      declarations: [ShowDetailsComponent], // composant non-standalone => declarations
      imports: [RouterTestingModule],
      providers: [
        { provide: ActivatedRoute, useValue: { snapshot: { params: { id: 1 } } } },
        {
          provide: EmployeeService,
          useValue: {
            getEmployeeById: () =>
              of({ id: 1, firstName: 'Test', lastName: 'User', emailId: 't@t.com' }),
          },
        },
      ],
    }).compileComponents();

    fixture = TestBed.createComponent(ShowDetailsComponent);
    component = fixture.componentInstance;
    fixture.detectChanges(); // déclenche ngOnInit
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
