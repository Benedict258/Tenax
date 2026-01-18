# Supabase Setup for Tenax

## 1. Create Supabase Project

1. Go to https://supabase.com
2. Click "New Project"
3. Name: **Tenax**
4. Database Password: (save this)
5. Region: Choose closest to you
6. Click "Create new project"

## 2. Run Database Schema

1. In Supabase dashboard, go to **SQL Editor**
2. Click "New Query"
3. Copy contents of `database/supabase_schema.sql`
4. Paste and click "Run"
5. Verify tables created in **Table Editor**

## 3. Get API Credentials

1. Go to **Settings** → **API**
2. Copy:
   - **Project URL** (e.g., `https://xxxxx.supabase.co`)
   - **anon public** key

## 4. Update .env File

Edit `backend/.env`:

```env
SUPABASE_URL=https://your-project.supabase.co
SUPABASE_ANON_KEY=your-anon-key-here
```

## 5. Update Models

Replace old PostgreSQL models with Supabase models:

```bash
# Backup old models
mv backend/src/models/User.js backend/src/models/User.old.js
mv backend/src/models/Task.js backend/src/models/Task.old.js

# Use Supabase models
mv backend/src/models/UserSupabase.js backend/src/models/User.js
mv backend/src/models/TaskSupabase.js backend/src/models/Task.js
```

Or manually update imports in your code.

## 6. Test Connection

```bash
cd backend
node -e "const supabase = require('./src/config/supabase'); supabase.from('users').select('count').then(r => console.log('✅ Connected:', r))"
```

## 7. Verify Tables

In Supabase dashboard → **Table Editor**, you should see:
- ✅ users
- ✅ tasks
- ✅ agent_states
- ✅ message_logs

## Benefits of Supabase

✅ **No local PostgreSQL needed** - fully hosted  
✅ **Real-time subscriptions** - live updates  
✅ **Built-in auth** - can use later  
✅ **Row Level Security** - data protection  
✅ **Auto-generated API** - REST & GraphQL  
✅ **Free tier** - 500MB database, 2GB bandwidth  

## Next Steps

Once Supabase is configured:

```bash
cd backend
node test-agent.js
```

All agent functions will now use Supabase! 🚀