---
layout: page
title: Context-aware child-directed speech detection
description: Detecting speech addressed to children in long-form recordings, using the surrounding context. Interspeech 2026.
importance: 2
related_publications: true
---

**Théo Charlot\*, Tarek Kunze\*, Kaveri K. Sheth, Alejandrina Cristia, Marvin Lavechin** · _Interspeech 2026_
<br><small>\* Equal contribution</small>

[Paper (arXiv)](https://arxiv.org/abs/2606.01134) · [Code](https://github.com/LAAC-LSCP/addressee)

## Abstract

Automatically distinguishing child-directed speech from adult-directed speech in long-form recordings is key to scalable analyses of children's language environments. Existing approaches process utterances in isolation and have been evaluated primarily on English. We address these gaps along three dimensions. First, we fine-tune and evaluate six self-supervised models on a multilingual dataset of 182 children, showing that in-domain pre-training on child-centered recordings substantially outperforms models trained on adult speech. Second, we demonstrate that incorporating surrounding context substantially improves classification, with an absolute gain of 13.8% in average F1-score. Third, we evaluate our model in a realistic end-to-end pipeline, from adult speech detection to addressee classification, showing that performance drops under automatic segmentation but still consistently outperforms a rule-based baseline.

{% cite charlot2026contextaware %}
