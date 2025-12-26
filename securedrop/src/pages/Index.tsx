import { useEffect } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { Shield, Upload, Scan, CheckCircle, Lock, Zap, ArrowRight } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { useAuth } from '@/hooks/useAuth';

export default function Index() {
  const { user, loading } = useAuth();
  const navigate = useNavigate();

  useEffect(() => {
    if (!loading && user) {
      navigate('/dashboard');
    }
  }, [user, loading, navigate]);

  const features = [
    {
      icon: Upload,
      title: 'Easy Upload',
      description: 'Drag and drop files to share securely with your colleagues.',
    },
    {
      icon: Scan,
      title: 'Auto Scanning',
      description: 'Every file is quarantined and scanned for ransomware and malware.',
    },
    {
      icon: CheckCircle,
      title: 'Safe Delivery',
      description: 'Clean files are approved and recipients are notified automatically.',
    },
    {
      icon: Lock,
      title: 'Enterprise Security',
      description: 'End-to-end encryption and secure storage for all your files.',
    },
  ];

  const steps = [
    { step: '01', title: 'Upload', description: 'Drop your file and enter recipient email' },
    { step: '02', title: 'Quarantine', description: 'File is isolated and scanned for threats' },
    { step: '03', title: 'Deliver', description: 'Clean files are released to recipients' },
  ];

  return (
    <div className="min-h-screen bg-background">
      {/* Header */}
      <header className="border-b border-border bg-card/50 backdrop-blur-sm">
        <div className="container mx-auto px-4 h-16 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="h-10 w-10 rounded-lg bg-primary flex items-center justify-center">
              <Shield className="h-6 w-6 text-primary-foreground" />
            </div>
            <span className="text-xl font-semibold text-foreground">SecureDrop</span>
          </div>
          <Button asChild>
            <Link to="/auth">Get Started</Link>
          </Button>
        </div>
      </header>

      {/* Hero Section */}
      <section className="py-20 lg:py-32">
        <div className="container mx-auto px-4">
          <div className="max-w-4xl mx-auto text-center">
            <div className="inline-flex items-center gap-2 px-4 py-2 rounded-full bg-primary/10 text-primary text-sm font-medium mb-6">
              <Zap className="h-4 w-4" />
              Enterprise-grade file security
            </div>
            <h1 className="text-4xl md:text-5xl lg:text-6xl font-bold text-foreground mb-6 leading-tight">
              Share files securely,
              <br />
              <span className="text-primary">protect against ransomware</span>
            </h1>
            <p className="text-lg md:text-xl text-muted-foreground mb-10 max-w-2xl mx-auto">
              SecureDrop quarantines and scans every file before delivery. 
              Keep your organization safe from malware while enabling seamless file sharing.
            </p>
            <div className="flex flex-col sm:flex-row gap-4 justify-center">
              <Button variant="hero" size="xl" asChild>
                <Link to="/auth" className="flex items-center gap-2">
                  Start Sharing Securely
                  <ArrowRight className="h-5 w-5" />
                </Link>
              </Button>
              <Button variant="outline" size="xl" asChild>
                <a href="#how-it-works">Learn How It Works</a>
              </Button>
            </div>
          </div>
        </div>
      </section>

      {/* Features */}
      <section className="py-20 bg-card/50">
        <div className="container mx-auto px-4">
          <div className="text-center mb-16">
            <h2 className="text-3xl md:text-4xl font-bold text-foreground mb-4">
              Built for enterprise security
            </h2>
            <p className="text-lg text-muted-foreground max-w-2xl mx-auto">
              Every feature designed to protect your organization from file-based threats.
            </p>
          </div>
          <div className="grid md:grid-cols-2 lg:grid-cols-4 gap-6 max-w-6xl mx-auto">
            {features.map((feature, index) => (
              <div
                key={index}
                className="p-6 rounded-xl bg-card border border-border hover:border-primary/30 hover:shadow-lg transition-all duration-300"
              >
                <div className="h-12 w-12 rounded-lg bg-primary/10 flex items-center justify-center mb-4">
                  <feature.icon className="h-6 w-6 text-primary" />
                </div>
                <h3 className="text-lg font-semibold text-foreground mb-2">{feature.title}</h3>
                <p className="text-muted-foreground">{feature.description}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* How It Works */}
      <section id="how-it-works" className="py-20">
        <div className="container mx-auto px-4">
          <div className="text-center mb-16">
            <h2 className="text-3xl md:text-4xl font-bold text-foreground mb-4">
              How SecureDrop works
            </h2>
            <p className="text-lg text-muted-foreground max-w-2xl mx-auto">
              A simple three-step process that keeps your files and organization secure.
            </p>
          </div>
          <div className="grid md:grid-cols-3 gap-8 max-w-4xl mx-auto">
            {steps.map((step, index) => (
              <div key={index} className="relative text-center">
                <div className="text-5xl font-bold text-primary/20 mb-4">{step.step}</div>
                <h3 className="text-xl font-semibold text-foreground mb-2">{step.title}</h3>
                <p className="text-muted-foreground">{step.description}</p>
                {index < steps.length - 1 && (
                  <div className="hidden md:block absolute top-8 right-0 translate-x-1/2 w-8">
                    <ArrowRight className="h-6 w-6 text-border" />
                  </div>
                )}
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* CTA */}
      <section className="py-20 bg-primary/5">
        <div className="container mx-auto px-4">
          <div className="max-w-3xl mx-auto text-center">
            <h2 className="text-3xl md:text-4xl font-bold text-foreground mb-4">
              Ready to secure your file sharing?
            </h2>
            <p className="text-lg text-muted-foreground mb-8">
              Join organizations that trust SecureDrop to protect their teams from ransomware.
            </p>
            <Button variant="hero" size="xl" asChild>
              <Link to="/auth" className="flex items-center gap-2">
                Get Started Free
                <ArrowRight className="h-5 w-5" />
              </Link>
            </Button>
          </div>
        </div>
      </section>

      {/* Footer */}
      <footer className="py-8 border-t border-border">
        <div className="container mx-auto px-4">
          <div className="flex flex-col md:flex-row items-center justify-between gap-4">
            <div className="flex items-center gap-2">
              <Shield className="h-5 w-5 text-primary" />
              <span className="font-medium text-foreground">SecureDrop</span>
            </div>
            <p className="text-sm text-muted-foreground">
              © 2024 SecureDrop. Secure file sharing for modern teams.
            </p>
          </div>
        </div>
      </footer>
    </div>
  );
}
