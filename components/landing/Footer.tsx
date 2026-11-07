const Footer = () => {
  return (
    <footer className="py-8 px-4 bg-background border-t border-border">
      <div className="max-w-6xl mx-auto flex flex-col md:flex-row items-center justify-between gap-4">
        <div className="flex items-center gap-2">
          <img src="/images/logo-icon.svg" alt="" className="w-7 h-7 rounded-full" />
          <span className="text-sm font-bold text-foreground">
            Vera<span className="text-muted-foreground font-medium">Fund</span>
          </span>
        </div>
        <div className="flex items-center gap-6">
          <a href="#features" className="text-xs text-muted-foreground hover:text-foreground transition-colors">Features</a>
          <a href="https://github.com/mian-abd/verafund" className="text-xs text-muted-foreground hover:text-foreground transition-colors">GitHub</a>
          <p className="text-xs text-muted-foreground">
            © 2026 VeraFund · sandbox cards, no real money
          </p>
        </div>
      </div>
    </footer>
  );
};

export default Footer;
