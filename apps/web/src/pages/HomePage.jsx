import { Link, Navigate } from "react-router-dom";
import { useAuth } from "../contexts/AuthContext.jsx";
import "../styles/home.css";

export default function HomePage() {
  const { isAuthenticated } = useAuth();

  // Redirect authenticated users to their dashboard
  if (isAuthenticated) {
    return <Navigate to="/app" replace />;
  }

  const features = [
    {
      title: "Secure Escrow",
      description: "Multi-currency escrow system ensuring safe transactions for all parties",
      icon: "🔐",
    },
    {
      title: "Milestone-Based Payments",
      description: "Get paid as work progresses with transparent milestone tracking",
      icon: "✓",
    },
    {
      title: "Multi-Currency Support",
      description: "Work with USD, KSH, and other currencies seamlessly",
      icon: "$",
    },
    {
      title: "Dispute Resolution",
      description: "Fair and transparent system for resolving disputes between parties",
      icon: "⚖",
    },
  ];

  return (
    <div className="home-shell">
      {/* Navigation */}
      <nav className="home-nav">
        <div className="nav-container">
          <div className="nav-brand">HUSTLERS</div>
          <div className="nav-links">
            <Link to="/auth/login" className="nav-link">
              Login
            </Link>
            <Link to="/auth/register" className="nav-button">
              Sign Up
            </Link>
          </div>
        </div>
      </nav>

      {/* Hero Section */}
      <section className="hero-section">
        <div className="hero-container">
          <div className="hero-content">
            <h1 className="hero-title">
              The Smart Platform for <span className="highlight">Secure Freelance</span> Work
            </h1>
            <p className="hero-subtitle">
              Connect with trusted professionals, manage projects with confidence, and get paid securely with our multi-currency escrow system.
            </p>
            <div className="hero-cta">
              <Link to="/auth/register" className="button-primary-large">
                Get Started Now
              </Link>
              <Link to="/auth/login" className="button-secondary-large">
                Already a Member? Sign In
              </Link>
            </div>
          </div>
          <div className="hero-visual">
            <div className="hero-card">
              <div className="card-icon">💼</div>
              <div className="card-text">
                <p>Join thousands of professionals</p>
                <span className="card-number">10K+</span>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* Features Section */}
      <section className="features-section">
        <div className="features-container">
          <div className="section-header">
            <h2>Why Choose HUSTLERS?</h2>
            <p>Everything you need for secure, transparent collaboration</p>
          </div>
          <div className="features-grid">
            {features.map((feature, idx) => (
              <div key={idx} className="feature-card">
                <div className="feature-icon">{feature.icon}</div>
                <h3>{feature.title}</h3>
                <p>{feature.description}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* How It Works Section */}
      <section className="how-it-works">
        <div className="how-container">
          <div className="section-header">
            <h2>How It Works</h2>
            <p>Simple, transparent, and secure</p>
          </div>
          <div className="steps-grid">
            <div className="step">
              <div className="step-number">1</div>
              <h3>Create a Project</h3>
              <p>Define your project, set milestones, and specify the budget</p>
            </div>
            <div className="step">
              <div className="step-number">2</div>
              <h3>Find Professionals</h3>
              <p>Browse qualified freelancers and select the best fit</p>
            </div>
            <div className="step">
              <div className="step-number">3</div>
              <h3>Secure Escrow</h3>
              <p>Funds are held safely in escrow during the project</p>
            </div>
            <div className="step">
              <div className="step-number">4</div>
              <h3>Track Progress</h3>
              <p>Monitor milestones and approve work as it completes</p>
            </div>
            <div className="step">
              <div className="step-number">5</div>
              <h3>Release Payment</h3>
              <p>Release funds upon milestone completion</p>
            </div>
            <div className="step">
              <div className="step-number">6</div>
              <h3>Rate & Review</h3>
              <p>Leave feedback and build your professional reputation</p>
            </div>
          </div>
        </div>
      </section>

      {/* Stats Section */}
      <section className="stats-section">
        <div className="stats-container">
          <div className="stat">
            <div className="stat-number">$2.5M+</div>
            <div className="stat-label">Transactions</div>
          </div>
          <div className="stat">
            <div className="stat-number">10K+</div>
            <div className="stat-label">Active Users</div>
          </div>
          <div className="stat">
            <div className="stat-number">5K+</div>
            <div className="stat-label">Projects Completed</div>
          </div>
          <div className="stat">
            <div className="stat-number">99.9%</div>
            <div className="stat-label">Uptime</div>
          </div>
        </div>
      </section>

      {/* CTA Section */}
      <section className="cta-section">
        <div className="cta-container">
          <h2>Ready to Get Started?</h2>
          <p>Join the community of trusted professionals and project owners</p>
          <Link to="/auth/register" className="button-primary-large">
            Create Your Account Today
          </Link>
        </div>
      </section>

      {/* Footer */}
      <footer className="home-footer">
        <div className="footer-container">
          <div className="footer-section">
            <h4>HUSTLERS</h4>
            <p>The secure platform for freelance work</p>
          </div>
          <div className="footer-section">
            <h4>Quick Links</h4>
            <Link to="/auth/login">Login</Link>
            <Link to="/auth/register">Sign Up</Link>
          </div>
          <div className="footer-section">
            <h4>Company</h4>
            <a href="#">About</a>
            <a href="#">Blog</a>
            <a href="#">Contact</a>
          </div>
          <div className="footer-section">
            <h4>Legal</h4>
            <a href="#">Terms of Service</a>
            <a href="#">Privacy Policy</a>
          </div>
        </div>
        <div className="footer-bottom">
          <p>&copy; 2026 HUSTLERS. All rights reserved.</p>
        </div>
      </footer>
    </div>
  );
}
