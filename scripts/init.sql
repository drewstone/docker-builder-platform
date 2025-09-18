-- Create database extensions
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- Create indexes for performance
CREATE INDEX IF NOT EXISTS idx_builds_project_status ON builds(project_id, status);
CREATE INDEX IF NOT EXISTS idx_builds_created_at ON builds(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_cache_entries_last_used ON cache_entries(last_used_at DESC);
CREATE INDEX IF NOT EXISTS idx_tokens_last_used ON tokens(last_used_at DESC);
CREATE INDEX IF NOT EXISTS idx_usage_date ON usage(date DESC);

-- Create functions for automatic timestamp updates
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ language 'plpgsql';

-- Apply auto-update triggers
CREATE TRIGGER update_organizations_updated_at BEFORE UPDATE ON organizations
FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_users_updated_at BEFORE UPDATE ON users
FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_projects_updated_at BEFORE UPDATE ON projects
FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_caches_updated_at BEFORE UPDATE ON caches
FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();