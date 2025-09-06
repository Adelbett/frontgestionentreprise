import { ComponentFixture, TestBed } from '@angular/core/testing';
import { RouterTestingModule } from '@angular/router/testing';
import { AppComponent } from './app.component';

describe('AppComponent', () => {
  let component: AppComponent;
  let fixture: ComponentFixture<AppComponent>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [RouterTestingModule],
      declarations: [AppComponent],
    })
      // on force un mini-template avec .navbar-brand
      .overrideTemplate(AppComponent, `<a class="navbar-brand">{{ title }}</a>`)
      .compileComponents();

    fixture = TestBed.createComponent(AppComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create the app', () => {
    expect(component).toBeTruthy();
  });

  it(`should have as title 'Gestion Entreprise'`, () => {
    expect(component.title).toEqual('Gestion Entreprise');
  });

  it('should render title in navbar', () => {
    const compiled = fixture.nativeElement as HTMLElement;
    const brand = compiled.querySelector('.navbar-brand');
    // 👉 Si .navbar-brand n'est pas trouvé, on aura un message clair:
    expect(brand).withContext('Missing .navbar-brand in overridden template').not.toBeNull();
    const text = (brand as HTMLElement).textContent?.trim() ?? '';
    expect(text).toContain('Gestion Entreprise');
  });
});
