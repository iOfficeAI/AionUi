# Style Index

The Agent uses this table to quickly select a reference style based on the topic. After selecting, read `<directory>/style.md` to understand the design philosophy; read `build.sh` when you need an implementation reference.

**Important Notice**:

- The build.sh scripts in these styles are **for reference of design techniques only** (color schemes, shapes, Morph choreography)
- Some scripts have text overlap, layout misalignment, and other typesetting issues -- **do not copy coordinates and dimensions verbatim**
- When generating, you must follow the design principles in `pptx-design.md` (text readability, spacing, alignment, etc.)
- **Learn the approach, do not copy the code**

---

## Dark Palette (dark)

| Directory                | Style Name               | Best For                                                        | Mood                                    |
| ------------------------ | ------------------------ | --------------------------------------------------------------- | --------------------------------------- |
| dark--liquid-flow        | Liquid Light             | Brand upgrades, creative launches, fashion showcases            | Fluid, dreamy, avant-garde              |
| dark--premium-navy       | Premium Navy & Gold      | High-end corporate, annual strategy, board presentations        | Authoritative, refined, premium         |
| dark--investor-pitch     | Investor Pitch Pro       | Investor pitches, fundraising decks, business plans             | Professional, trustworthy, composed     |
| dark--cosmic-neon        | Cosmic Neon              | Science talks, futuristic topics, physics, cosmic themes        | Sci-fi, mysterious, futuristic, neon    |
| dark--editorial-story    | Editorial Magazine Story | Brand storytelling, editorial magazines, content releases       | Narrative, artistic, premium            |
| dark--tech-cosmos        | Tech Cosmos              | Tech talks, architecture reviews, scientific presentations      | Futuristic, scientific, cosmic          |
| dark--blueprint-grid     | Blueprint Grid           | Technical planning, engineering blueprints, system architecture | Precise, professional, engineered       |
| dark--diagonal-cut       | Diagonal Industrial Cut  | Industrial, engineering, construction, manufacturing            | Rugged, powerful, bold                  |
| dark--spotlight-stage    | Spotlight Stage          | Keynotes, launch events, TED-style talks, galas                 | Dramatic, focused, theatrical           |
| dark--cyber-future       | Cyber Future             | Futuristic topics, tech vision, cyberpunk, AI/robotics          | Futuristic, cyberpunk, immersive        |
| dark--circle-digital     | Dark Digital Agency      | Digital marketing, creative agencies, tech companies            | Modern, dark-cool, digital              |
| dark--architectural-plan | Architectural Plan       | Architectural design, business plans, real estate development   | Professional, structured, architectural |
| dark--luxury-minimal     | Luxury Minimal           | Luxury brands, premium products, high-end corporate             | Luxurious, minimalist, sophisticated    |
| dark--space-odyssey      | Space Odyssey            | Space/astronomy, science education, exploration narratives      | Cosmic, inspiring, epic, exploratory    |
| dark--neon-productivity  | Neon Productivity        | Productivity talks, tech workshops, motivation, startups        | Energetic, modern, vibrant              |

## Light Palette (light)

| Directory                   | Style Name               | Best For                                                  | Mood                                |
| --------------------------- | ------------------------ | --------------------------------------------------------- | ----------------------------------- |
| light--minimal-corporate    | Minimal Corporate Report | Annual reports, work summaries, business proposals        | Professional, clean, composed       |
| light--minimal-product      | Minimal Product Showcase | Product launches, tech showcases, brand introductions     | Modern, minimalist, premium         |
| light--project-proposal     | Project Proposal         | Project kickoffs, business proposals, bid presentations   | Professional, trustworthy, rigorous |
| light--bold-type            | Bold Typography          | Editorial layouts, magazine-style, brand manuals          | Bold, modern, editorial             |
| light--isometric-clean      | Isometric Clean Tech     | Tech products, SaaS platforms, data presentations         | Fresh, modern, techy                |
| light--spring-launch        | Spring Launch Fresh      | Spring launches, new product releases, seasonal marketing | Fresh, natural, vibrant             |
| light--training-interactive | Interactive Training     | Corporate training, online courses, knowledge sharing     | Educational, interactive, friendly  |
| light--watercolor-wash      | Watercolor Wash          | Art, cultural creative, tea ceremony, weddings            | Soft, poetic, artistic              |

## Warm Palette (warm)

| Directory                | Style Name         | Best For                                                         | Mood                          |
| ------------------------ | ------------------ | ---------------------------------------------------------------- | ----------------------------- |
| warm--earth-organic      | Earth & Sage       | Eco-friendly, sustainability, organic brands                     | Warm, sincere, natural        |
| warm--minimal-brand      | Minimal Brand      | Brand introductions, product launches, premium brand showcases   | Warm, refined, minimalist     |
| warm--brand-refresh      | Brand Refresh      | Brand launches, corporate image updates, creative proposals      | Fashionable, colorful, modern |
| warm--creative-marketing | Creative Marketing | Marketing campaigns, ad creatives, poster-style PPTs             | Bold, impactful, expressive   |
| warm--playful-organic    | Playful Organic    | Lifestyle, pet/animal topics, children's education, storytelling | Warm, playful, friendly       |

## Vivid Palette (vivid)

| Directory                | Style Name              | Best For                                              | Mood                            |
| ------------------------ | ----------------------- | ----------------------------------------------------- | ------------------------------- |
| vivid--candy-stripe      | Rainbow Candy Stripe    | Event celebrations, holidays, children's education    | Joyful, lively, rainbow         |
| vivid--playful-marketing | Vibrant Youth Marketing | Marketing campaigns, new product promos, sales events | Youthful, energetic, passionate |

## Black & White (bw)

| Directory         | Style Name    | Best For                                                     | Mood                           |
| ----------------- | ------------- | ------------------------------------------------------------ | ------------------------------ |
| bw--mono-line     | Minimal Line  | Minimalist corporate, academic reports, consulting proposals | Calm, restrained, professional |
| bw--swiss-bauhaus | Swiss Bauhaus | Design agencies, architecture firms, art exhibitions         | Rational, rigorous, classic    |
| bw--brutalist-raw | Brutalist Raw | Avant-garde art shows, experimental design, indie brands     | Rebellious, rugged, impactful  |

## Mixed Palette (mixed)

| Directory            | Style Name    | Best For                                                | Mood                         |
| -------------------- | ------------- | ------------------------------------------------------- | ---------------------------- |
| mixed--duotone-split | Duotone Split | Brand launches, architectural design, premium showcases | Bold, architectural, minimal |

---

## Quick Lookup by Use Case

| Use Case                                 | Recommended Styles                                                                           |
| ---------------------------------------- | -------------------------------------------------------------------------------------------- |
| **Tech / AI / SaaS**                     | dark--tech-cosmos, dark--cyber-future, light--isometric-clean                                |
| **Investment / Pitch / Fundraising**     | dark--investor-pitch, dark--premium-navy, light--project-proposal                            |
| **Corporate / Business / Reports**       | light--minimal-corporate, light--minimal-product, dark--premium-navy                         |
| **Brand / Launch / Marketing**           | warm--brand-refresh, warm--creative-marketing, vivid--playful-marketing, warm--minimal-brand |
| **Design / Architecture / Art**          | bw--swiss-bauhaus, bw--brutalist-raw, dark--architectural-plan, mixed--duotone-split         |
| **Education / Training / Courseware**    | light--training-interactive, warm--playful-organic, vivid--candy-stripe                      |
| **Keynotes / Launch Events / Galas**     | dark--spotlight-stage, dark--liquid-flow                                                     |
| **Developer / Technical**                | dark--cyber-future, dark--blueprint-grid, dark--tech-cosmos                                  |
| **Eco / Nature / Organic**               | warm--earth-organic, warm--minimal-brand, light--spring-launch                               |
| **Cultural Creative / Magazine / Story** | dark--editorial-story, light--watercolor-wash, light--bold-type                              |
| **Sci-Fi / Space / Futuristic**          | dark--space-odyssey, dark--cosmic-neon, dark--cyber-future                                   |
| **Luxury / Premium**                     | dark--luxury-minimal, dark--premium-navy, warm--minimal-brand                                |
| **Productivity / Motivation**            | dark--neon-productivity, dark--cyber-future                                                  |
