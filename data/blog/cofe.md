---
title: The Complete Cofe Guide
date: 2025-10-06T10:30:00.000Z
status: draft
latitude: 37.78297388090404
longitude: -122.41031261300729
city: San Francisco
street: Market Street
external_discussions:
  - platform: hackernews
    url: https://news.ycombinator.com/item?id=example
---

# The Complete Cofe Guide

[**Cofe**](https://github.com/metrue/cofe) is beautifully simple blog and memo taking app that stores everything in your Github repository in the Git version control enabled.
No database, no complex setups, just write and publish.

Full features but in a simple and elegant way:

* Powerful editor, fully Markdown support memo and blog writing in one place.
* External discussions as comments, enable more engaging for both writing and reading.
* Builtin observerbility enabled with open source Umami, visitors metrics available out of box.
* 'Likes' functionality enable a light interactions between you and audiences.
    
Cannot wait to see it, check [https://blog.minghe.me](https://blog.minghe.me) - my blog powered by Cofe.

## Quick Start

### 1. Up and Run Cofe Locally

```bash
git clone https://github.com/metrue/Cofe.git
cd Cofe
npm install
```

Create your environment variables:

```bash
# Required for GitHub integration
export GITHUB_USERNAME='your-github-username'
export GITHUB_ID='your-github-oauth-client-id'
export GITHUB_SECRET='your-github-oauth-client-secret'

# Required for authentication
export NEXTAUTH_SECRET='your-random-secret-string'
export NEXTAUTH_URL='http://localhost:3000'

# Optional: Analytics (see Analytics section)
export NEXT_PUBLIC_ANALYTICS_ENABLED=false
```

### 2. Deploy Your Cofe Blog

Cofe is just another NextJS application, so you can refer to
following documentations to know about how to do the NextJS
application deployment on different platform, generally
almost all the platforms do support running NextJS natively,
no need extra complex setup.

* Deploy Cofe on Vercel
* Deploy Cofe on Cloudflare

After above steps, you should be able to visit your blog
and check your blog posts and memos from browser with the domain assigned to you by the
platform.

To be able to login to your editor and start writing, you
have one last step to finish: making your blog to be a
Github OAuth App.

First, create a GitHub OAuth App:

1. Go to [GitHub Settings > Developer Settings > OAuth Apps](https://github.com/settings/developers)
2. Click "New OAuth App"
3. Fill in the details:
   - **Application name**: Your blog site name, e.g., `Cofe Blog`
   - **Homepage URL**: you domain for your blog site, e.g. `https://blog.minghe.me`, or you can use `http://localhost:3000` for development
   - **Authorization callback URL**: your domain for your
       blog site, e.g., `https://blog.minghe.me`, or `http://localhost:3000` for local development.
4. Save your **Client ID** and **Client Secret**
5. Set the GITHUB_USERNAME, GITHUB_ID, and GITHUB_SECRET
   into the environment variable, then restart (or re-deploy) your blog.
6. Now you should be able to click on the 'Github' icon and
   oauth signin with your Github ID. and happy writing.

## Core Features

### Full functionality editor with creative addons

Cofe editor fully not support Github flavor Markdown syntax,
but also support image drag and drop to enable full media
blog post writting.

The writing location awareness automatically attach current
location to the blog post while writing enable a enhance
writing experience with special memory with location
recorded.

The external discussins attaching feature creatively bring
the happening discussions about the post embeded into blog
post, highly improve the engagement. Imagine that you share
your awesome post to Hacknernews, Reddit, or V2EX,
aggregating these comments into your post page will be so
amazing, that's what it's. 

### Clean and Elegant Layout

Putting the social network and profession profile links into the configuration,
Cofe can become perfect act the front door for your internet world.

The card style layout bring the unified experience to both
short Memo and long blog post, solid responsible design
enable your content perectly display on all the screens.

## Advanced Configuration

### Analytics Setup

Enable privacy-first analytics with Umami:

1. **Get Umami**: Sign up at [cloud.umami.is](https://cloud.umami.is) or [self-host](https://umami.is/docs)
2. **Create Website**: Add your domain and get the Website ID
3. **Configure Environment**:

```bash
export NEXT_PUBLIC_ANALYTICS_ENABLED=true
export NEXT_PUBLIC_UMAMI_WEBSITE_ID=your-website-id

# Optional: Custom Umami instance
export NEXT_PUBLIC_UMAMI_SCRIPT_URL=https://your-umami.com/script.js

# Optional: Domain restrictions
export NEXT_PUBLIC_UMAMI_DOMAINS=yourdomain.com,www.yourdomain.com
```

### Site Configuration

Customize your site in `lib/siteConfig.ts`:

```typescript
export const getSiteConfig = () => ({
  title: 'Your Blog Name',
  description: 'Your blog description',
  author: {
    name: 'Your Name',
    email: 'your@email.com'
  },
  social: {
    twitter: 'yourusername',
    github: 'yourusername'
  },
  keywords: ['blog', 'tech', 'programming']
})
```

### Custom Styling

Cofe uses Tailwind CSS. Customize styles in:

- `app/globals.css` - Global styles
- `tailwind.config.js` - Tailwind configuration
- Individual components for specific customizations

## Content Management

### File Structure

Cofe stores content in your GitHub repository:

```
data/
├── blog/           # Blog posts (.md files)
├── memos.json      # All memos
├── links.json      # External links
└── likes.json      # Like data
```

### Blog Post Format

Blog posts use frontmatter:

```yaml
---
title: Your Post Title
date: 2025-10-06T10:30:00.000Z
latitude: 37.7749
longitude: -122.4194
city: San Francisco
street: Market Street
external_discussions:
  - platform: hackernews
    url: https://news.ycombinator.com/item?id=123
---

Your markdown content here...
```

### Memo Format

Memos are stored as JSON objects:

```json
{
  "id": "1728123456789",
  "content": "Your memo content with **markdown**",
  "timestamp": "2025-10-06T10:30:00.000Z",
  "latitude": 37.7749,
  "longitude": -122.4194,
  "city": "San Francisco",
  "street": "Market Street"
}
```

## Deployment

### Vercel (Recommended)

1. **Deploy**: Click the deploy button or connect your GitHub repo
2. **Environment Variables**: Add all your environment variables
3. **Domain**: Configure your custom domain
4. **SSL**: Automatic HTTPS setup

### Other Platforms

Cofe works on any platform that supports Next.js:

- **Netlify**: Use the Next.js plugin
- **Railway**: Direct deployment support
- **DigitalOcean App Platform**: Node.js app
- **Self-hosted**: Docker or Node.js server

### Getting Help

1. **Check Issues**: [GitHub Issues](https://github.com/metrue/Cofe/issues)
2. **Discussions**: Use the external discussions feature
3. **Contributing**: See [CLAUDE.md](./CLAUDE.md) for development guidelines

## Migration

### From Jekyll

1. Copy markdown files to `data/blog/`
2. Update frontmatter format
3. Move images to GitHub repository
4. Update image URLs

### From Hugo

1. Convert content to standard markdown
2. Update frontmatter dates to ISO format
3. Migrate static assets
4. Configure redirects if needed

### From Ghost/WordPress

1. Export content to markdown
2. Clean up HTML remnants
3. Convert featured images
4. Set up URL redirects

## Performance Tips

1. **Image Optimization**: Use WebP format when possible
2. **Caching**: Enable Vercel Edge Caching
3. **Analytics**: Use minimal tracking for better performance
4. **Content**: Keep memo count reasonable for faster loading

## Security

- **Authentication**: GitHub OAuth only
- **Data Storage**: Your GitHub repository
- **Privacy**: No external databases
- **Analytics**: Privacy-first Umami integration
- **HTTPS**: Required in production

---

**That's everything!** Cofe is designed to be simple yet powerful. Start with the basics and customize as you grow.
