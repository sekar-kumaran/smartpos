-- SmartPOS AI – PostgreSQL Database Initialization
-- Runs once when the Docker container first starts

-- Ensure UTF-8 encoding
SET client_encoding = 'UTF8';

-- Create extensions
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
CREATE EXTENSION IF NOT EXISTS "pg_stat_statements";

-- Performance tuning comments (apply these in production pg config)
-- shared_buffers = 256MB
-- effective_cache_size = 768MB
-- maintenance_work_mem = 64MB
-- checkpoint_completion_target = 0.9
-- wal_buffers = 16MB
-- default_statistics_target = 100

-- Grant privileges
GRANT ALL PRIVILEGES ON DATABASE smartpos TO smartpos;
