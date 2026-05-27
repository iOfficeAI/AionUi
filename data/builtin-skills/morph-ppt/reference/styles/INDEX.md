# Style Index

The Agent uses this table to quickly select a reference style based on the topic. After selecting, read `<directory>/style.md` to understand the design philosophy; read `build.sh` when you need an implementation reference.

**Important Notice**:

- The build.sh scripts in these styles are **for reference of design techniques only** (color schemes, shapes, Morph choreography)
- Some scripts have text overlap, layout misalignment, and other typesetting issues -- **do not copy coordinates and dimensions verbatim**
- When generating, you must follow the design principles in `pptx-design.md` (text readability, spacing, alignment, etc.)
- **Learn the approach, do not copy the code**

---

**Primary hex column**: bg / fg / accent — sampled from each style's `build.sh`. Use this to eyeball-match a user-specified brand color before opening any `style.md`. `-` = style has only `style.md` (no build script to extract from).

## Dark Palette (dark)

| Directory                | Style Name               | Primary hex (bg / fg / accent) | Best For                                                        | Mood                                    |
| ------------------------ | ------------------------ | ------------------------------ | --------------------------------------------------------------- | --------------------------------------- |
| dark--liquid-flow        | Liquid Light             | `#0F0F2D / #6C63FF / #48E5C2`  | Brand upgrades, creative launches, fashion showcases            | Fluid, dreamy, avant-garde              |
| dark--premium-navy       | Premium Navy & Gold      | `#0C1B33 / #C9A84C / #1E3A5F`  | High-end corporate, annual strategy, board presentations        | Authoritative, refined, premium         |
| dark--investor-pitch     | Investor Pitch Pro       | `#1A1A2E / #0F3460 / #16213E`  | Investor pitches, fundraising decks, business plans             | Professional, trustworthy, composed     |
| dark--cosmic-neon        | Cosmic Neon              | `#050510 / #8A2BE2 / #00FFFF`  | Science talks, futuristic topics, physics, cosmic themes        | Sci-fi, mysterious, futuristic, neon    |
| dark--editorial-story    | Editorial Magazine Story | `#FFFFFF / #2C3E50 / #E74C3C`  | Brand storytelling, editorial magazines, content releases       | Narrative, artistic, premium            |
| dark--tech-cosmos        | Tech Cosmos              | `-`                            | Tech talks, architecture reviews, scientific presentations      | Futuristic, scientific, cosmic          |
| dark--blueprint-grid     | Blueprint Grid           | `#1B3A5C / #4A90D9 / #FFFFFF`  | Technical planning, engineering blueprints, system architecture | Precise, professional, engineered       |
| dark--diagonal-cut       | Diagonal Industrial Cut  | `#1A1A1A / #FF6600 / #FFCC00`  | Industrial, engineering, construction, manufacturing            | Rugged, powerful, bold                  |
| dark--spotlight-stage    | Spotlight Stage          | `#0A0A0A / #FFFFFF / #FFE0B2`  | Keynotes, launch events, TED-style talks, galas                 | Dramatic, focused, theatrical           |
| dark--cyber-future       | Cyber Future             | `#0B0C10 / #66FCF1 / #1F2833`  | Futuristic topics, tech vision, cyberpunk, AI/robotics          | Futuristic, cyberpunk, immersive        |
| dark--circle-digital     | Dark Digital Agency      | `#0D0E11 / #171A20 / #22252E`  | Digital marketing, creative agencies, tech companies            | Modern, dark-cool, digital              |
| dark--architectural-plan | Architectural Plan       | `#FFFFFF / #18293B / #B5D5E3`  | Architectural design, business plans, real estate development   | Professional, structured, architectural |
| dark--luxury-minimal     | Luxury Minimal           | `#111111 / #D4AF37 / #FFFFFF`  | Luxury brands, premium products, high-end corporate             | Luxurious, minimalist, sophisticated    |
| dark--space-odyssey      | Space Odyssey            | `#0A0E27 / #1E3A5F / #4A5FFF`  | Space/astronomy, science education, exploration narratives      | Cosmic, inspiring, epic, exploratory    |
| dark--neon-productivity  | Neon Productivity        | `#0B0F1A / #2BE4A8 / #FFB020`  | Productivity talks, tech workshops, motivation, startups        | Energetic, modern, vibrant              |
| dark--midnight-blueprint | Midnight Blueprint       | `#080B2A / #181B55 / #131650`  | Architecture firms, professional services, luxury real estate   | Sophisticated, architectural, premium   |
| dark--sage-grain         | Sage Grain               | `#1E2720 / #FFFFFF / #D9B88F`  | Creative agencies, boutique consultancies, organic brands       | Organic, sophisticated, artisanal       |
| dark--obsidian-amber     | Obsidian Amber           | `-`                            | Finance, investment, luxury services, premium consulting        | Premium, sophisticated, powerful        |
| dark--velvet-rose        | Velvet Rose              | `-`                            | Luxury brands, premium fashion, high-end retail                 | Luxurious, elegant, refined             |
| dark--aurora-softedge    | Aurora Softedge          | `-`                            | Design portfolios, creative showcases, art galleries            | Aurora-like, dreamy, artistic           |

## Light Palette (light)

| Directory                   | Style Name               | Primary hex (bg / fg / accent) | Best For                                                  | Mood                                |
| --------------------------- | ------------------------ | ------------------------------ | --------------------------------------------------------- | ----------------------------------- |
| light--minimal-corporate    | Minimal Corporate Report | `#FFFFFF / #E8EEF4 / #1E3A5F`  | Annual reports, work summaries, business proposals        | Professional, clean, composed       |
| light--minimal-product      | Minimal Product Showcase | `#FAFAFA / #00B894 / #2D3436`  | Product launches, tech showcases, brand introductions     | Modern, minimalist, premium         |
| light--project-proposal     | Project Proposal         | `#E8EEF4 / #1E3A5F / #D4A84B`  | Project kickoffs, business proposals, bid presentations   | Professional, trustworthy, rigorous |
| light--bold-type            | Bold Typography          | `#F2F2F2 / #1A1A1A / #E8E8E8`  | Editorial layouts, magazine-style, brand manuals          | Bold, modern, editorial             |
| light--isometric-clean      | Isometric Clean Tech     | `#F0F4F8 / #E8ECF1 / #4A90D9`  | Tech products, SaaS platforms, data presentations         | Fresh, modern, techy                |
| light--spring-launch        | Spring Launch Fresh      | `#E8F5E9 / #4CAF50 / #8BC34A`  | Spring launches, new product releases, seasonal marketing | Fresh, natural, vibrant             |
| light--training-interactive | Interactive Training     | `#FFF9E6 / #FF6B6B / #4ECDC4`  | Corporate training, online courses, knowledge sharing     | Educational, interactive, friendly  |
| light--watercolor-wash      | Watercolor Wash          | `#FFFDF7 / #7AADCF / #E8A87C`  | Art, cultural creative, tea ceremony, weddings            | Soft, poetic, artistic              |
| light--firmwise-saas        | Firmwise SaaS            | `#EFF2F7 / #7B3FF2 / #FFFFFF`  | SaaS platforms, productivity tools, B2B software          | Clean, efficient, trustworthy       |
| light--glassmorphism-vc     | Glassmorphism VC         | `-`                            | VC funds, investment decks, fintech, startup pitches      | Modern, premium, sophisticated      |
| light--fluid-gradient       | Fluid Gradient           | `-`                            | AI/tech products, SaaS platforms, modern software         | Fluid, tech-forward, dynamic        |

## Warm Palette (warm)

| Directory                | Style Name         | Primary hex (bg / fg / accent) | Best For                                                          | Mood                             |
| ------------------------ | ------------------ | ------------------------------ | ----------------------------------------------------------------- | -------------------------------- |
| warm--earth-organic      | Earth & Sage       | `#F5F0E8 / #8B6F47 / #A8C686`  | Eco-friendly, sustainability, organic brands                      | Warm, sincere, natural           |
| warm--minimal-brand      | Minimal Brand      | `-`                            | Brand introductions, product launches, premium brand showcases    | Warm, refined, minimalist        |
| warm--brand-refresh      | Brand Refresh      | `#F5F0E8 / #162040 / #1A6BFF`  | Brand launches, corporate image updates, creative proposals       | Fashionable, colorful, modern    |
| warm--creative-marketing | Creative Marketing | `-`                            | Marketing campaigns, ad creatives, poster-style PPTs              | Bold, impactful, expressive      |
| warm--playful-organic    | Playful Organic    | `#FFF8E7 / #3D3B3C / #FFFFFF`  | Lifestyle, pet/animal topics, children's education, storytelling  | Warm, playful, friendly          |
| warm--sunset-mosaic      | Sunset Mosaic      | `-`                            | Engineering, infrastructure, B2B corporate, construction          | Professional, warm, grounded     |
| warm--coral-culture      | Coral Culture      | `-`                            | Company culture decks, HR presentations, team showcases           | Warm, cultural, human-centered   |
| warm--monument-editorial | Monument Editorial | `-`                            | Architecture, luxury brands, editorial magazines, studio branding | Monumental, refined, typographic |
| warm--vital-bloom        | Vital Bloom        | `-`                            | Wellness apps, yoga studios, mindful living, organic brands       | Organic, vibrant, healthy        |
| warm--bloom-academy      | Bloom Academy      | `-`                            | Education, e-learning, children's content, playful branding       | Playful, educational, friendly   |

## Vivid Palette (vivid)

| Directory                | Style Name              | Primary hex (bg / fg / accent) | Best For                                              | Mood                            |
| ------------------------ | ----------------------- | ------------------------------ | ----------------------------------------------------- | ------------------------------- |
| vivid--candy-stripe      | Rainbow Candy Stripe    | `#FFFFFF / #FF5252 / #FF7B39`  | Event celebrations, holidays, children's education    | Joyful, lively, rainbow         |
| vivid--playful-marketing | Vibrant Youth Marketing | `#FFFFFF / #FF6B6B / #4ECDC4`  | Marketing campaigns, new product promos, sales events | Youthful, energetic, passionate |
| vivid--energy-neon       | Energy Neon             | `#E8E8E8 / #00FF41 / #111111`  | Conferences, energy summits, tech events, editorial   | Energetic, impactful, modern    |
| vivid--pink-editorial    | Pink Editorial          | `#160B33 / #7B2D52 / #C85080`  | Annual reports, data journalism, editorial showcases  | Contemporary, editorial, bold   |
| vivid--bauhaus-electric  | Bauhaus Electric        | `-`                            | Creative agencies, design studios, bold branding      | Bold, energetic, electric       |

## Black & White (bw)

| Directory         | Style Name    | Primary hex (bg / fg / accent) | Best For                                                     | Mood                           |
| ----------------- | ------------- | ------------------------------ | ------------------------------------------------------------ | ------------------------------ |
| bw--mono-line     | Minimal Line  | `#FFFFFF / #1A1A1A / #C8C8C8`  | Minimalist corporate, academic reports, consulting proposals | Calm, restrained, professional |
| bw--swiss-bauhaus | Swiss Bauhaus | `#E63322 / #1C1C1C / #F5F5F5`  | Design agencies, architecture firms, art exhibitions         | Rational, rigorous, classic    |
| bw--brutalist-raw | Brutalist Raw | `#FFFFFF / #000000 / #FF0000`  | Avant-garde art shows, experimental design, indie brands     | Rebellious, rugged, impactful  |
| bw--swiss-system  | Swiss System  | `#FFFFFF / #000000 / #FF0000`  | Corporate, finance, consulting, professional services        | Clean, systematic, bold        |

## Mixed Palette (mixed)

| Directory                   | Style Name           | Primary hex (bg / fg / accent) | Best For                                                | Mood                              |
| --------------------------- | -------------------- | ------------------------------ | ------------------------------------------------------- | --------------------------------- |
| mixed--duotone-split        | Duotone Split        | `#FFFFFF / #2D3436 / #E17055`  | Brand launches, architectural design, premium showcases | Bold, architectural, minimal      |
| mixed--chromatic-aberration | Chromatic Aberration | `#050814 / #0A1030 / #00F5E4`  | Tech startups, AI platforms, creative technology        | Futuristic, glitch, cyber         |
| mixed--bauhaus-blocks       | Bauhaus Color Block  | `#F0EBE0 / #1D5C38 / #F4C040`  | Creative studios, design portfolios, branding agencies  | Bold, modernist, geometric        |
| mixed--spectral-grid        | Spectral Grid        | `-`                            | Creative tech, innovation showcases, design conferences | Vibrant, innovative, experimental |

---

## Quick Lookup by Use Case

| Use Case                                 | Recommended Styles                                                                                                                                                                     |
| ---------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Tech / AI / SaaS**                     | dark--tech-cosmos, dark--cyber-future, light--isometric-clean, mixed--chromatic-aberration, light--firmwise-saas, light--fluid-gradient                                                |
| **Investment / Pitch / Fundraising**     | dark--investor-pitch, dark--premium-navy, light--project-proposal, light--glassmorphism-vc, dark--obsidian-amber                                                                       |
| **Corporate / Business / Reports**       | light--minimal-corporate, light--minimal-product, dark--premium-navy, vivid--pink-editorial, warm--sunset-mosaic, warm--coral-culture                                                  |
| **Brand / Launch / Marketing**           | warm--brand-refresh, warm--creative-marketing, vivid--playful-marketing, warm--minimal-brand, vivid--bauhaus-electric                                                                  |
| **Design / Architecture / Art**          | bw--swiss-bauhaus, bw--brutalist-raw, dark--architectural-plan, mixed--duotone-split, dark--midnight-blueprint, mixed--bauhaus-blocks, dark--aurora-softedge, warm--monument-editorial |
| **Education / Training / Courseware**    | light--training-interactive, warm--playful-organic, vivid--candy-stripe, warm--bloom-academy                                                                                           |
| **Keynotes / Launch Events / Galas**     | dark--spotlight-stage, dark--liquid-flow, vivid--energy-neon                                                                                                                           |
| **Creative Agency / Studio**             | dark--sage-grain, mixed--bauhaus-blocks, dark--circle-digital, vivid--bauhaus-electric, mixed--spectral-grid                                                                           |
| **Developer / Technical**                | dark--cyber-future, dark--blueprint-grid, dark--tech-cosmos                                                                                                                            |
| **Eco / Nature / Organic**               | warm--earth-organic, warm--minimal-brand, light--spring-launch                                                                                                                         |
| **Cultural Creative / Magazine / Story** | dark--editorial-story, light--watercolor-wash, light--bold-type, warm--monument-editorial                                                                                              |
| **Sci-Fi / Space / Futuristic**          | dark--space-odyssey, dark--cosmic-neon, dark--cyber-future                                                                                                                             |
| **Luxury / Premium**                     | dark--luxury-minimal, dark--premium-navy, warm--minimal-brand, dark--velvet-rose                                                                                                       |
| **Productivity / Motivation**            | dark--neon-productivity, dark--cyber-future                                                                                                                                            |
| **Wellness / Health / Lifestyle**        | warm--vital-bloom, warm--playful-organic, light--spring-launch                                                                                                                         |
| **Finance / Investment**                 | dark--obsidian-amber, dark--investor-pitch, light--glassmorphism-vc                                                                                                                    |
