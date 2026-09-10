---
layout: page
title: BabyHuBERT
description: Multilingual self-supervised learning for segmenting speakers in child-centered long-form recordings. Interspeech 2026.
importance: 1
related_publications: true
---

**Théo Charlot\*, Tarek Kunze\*, Maxime Poli, Alejandrina Cristia, Emmanuel Dupoux, Marvin Lavechin** · _Interspeech 2026_
<br><small>\* Equal contribution</small>

[Paper (arXiv)](https://arxiv.org/abs/2509.15001) · [Training code](https://github.com/LAAC-LSCP/BabyHuBERT) · [Voice Type Classifier](https://github.com/LAAC-LSCP/VTC)

## Abstract

Child-centered daylong recordings are essential for studying early language development, but existing speech models trained on clean adult data perform poorly due to acoustic and linguistic differences. We introduce BabyHuBERT, a self-supervised speech model trained on 13,000 hours of multilingual child-centered recordings from 40+ languages. Evaluated on voice type classification, the task of identifying who produces speech and when in child-centered recordings (key child, other children, male, and female adults), BabyHuBERT-VTC achieves F1-scores from 55.0% to 76.1% across six corpora, consistently outperforming W2V2-LL4300 and HuBERT (pretrained on English daylongs and clean adult speech, respectively). Notable gains include 14.0 and 18.3 absolute F1 points over HuBERT on Vanuatu and Solomon Islands, demonstrating effectiveness on underrepresented languages. We share code and models to support researchers working with child-centered recordings across diverse linguistic contexts.

{% cite charlot2025babyhubert %}
