# Research basis

Each part of Truly's design follows from published research. This page summarises that research and lists the sources.

## Asking comes first

Brief self-report questionnaires are an established and validated way to understand low mood. The PHQ-9, a nine item self-report measure, is widely used to assess depression severity (Kroenke, Spitzer and Williams, 2001). Truly's check-in follows the same idea: the person's own answers are the primary signal, and every model output ranks below them.

## Faces are a weak guide to feelings

A major review of the evidence found that facial movements do not reliably and specifically reveal a person's emotional state. The same expression can accompany different feelings, and the same feeling can show on the face in many ways; a smile, for example, does not reliably mean happiness (Barrett, Adolphs, Marsella, Martinez and Pollak, 2019).

This is why the camera in Truly is optional and never makes a decision. Its role is limited to two things: suggesting the starting point for music, and noticing when an outward expression and a person's own report differ, which is the situation of someone who seems fine to others but is not.

## Voice carries a measurable signal of low mood

Speech is one of the most studied behavioural signals in depression research. Reviews describe consistent changes in how people with depression speak, including in timing, pausing, pitch variation and voice quality, and identify speech as a promising signal for depression and suicide risk assessment (Cummins et al., 2015; Low, Bentley and Ghosh, 2020). A systematic review of voice quality markers reports discrimination between people with and without depression with AUCs from 0.71 to 0.93 (Briganti and Lechien, 2025), and recent work using self-supervised speech representations reports 88% accuracy on an external validation sample (Lin et al., 2026). A voice biomarker tool evaluated in primary care detected signals consistent with moderate to severe depression from short speech samples (Mazur et al., 2025).

The literature presents voice as a screening and monitoring signal. Truly uses it in exactly that role: an optional, private signal that can make a gentle suggestion to talk to someone more likely when the person's own check-ins are also low. It reads only how a person speaks, never what they say.

## Music can help, and how it is chosen matters

A Cochrane systematic review concluded that music therapy provides short-term benefits for people with depression: added to usual care, it improved depressive symptoms, decreased anxiety and improved functioning (Aalbers et al., 2017).

The iso principle is a music therapy method for mood regulation: music first matches the listener's current state and then changes step by step towards the desired one. It is used as a central method in mood management in music psychotherapy (Heiderscheit and Madson, 2015), and listening according to the iso principle has been shown to modulate affective state (Starcke and von Georgi, 2024). Truly's music path is built on this principle, and generated paths are compared with playlists used in randomised controlled trials of music interventions (Du et al., 2026).

## References

- Aalbers, S., Fusar-Poli, L., Freeman, R. E., Spreen, M., Ket, J. C., Vink, A. C., Maratos, A., Crawford, M., Chen, X. J., and Gold, C. (2017). Music therapy for depression. *Cochrane Database of Systematic Reviews*, 2017(11). [doi:10.1002/14651858.CD004517.pub3](https://doi.org/10.1002/14651858.CD004517.pub3)
- Barrett, L. F., Adolphs, R., Marsella, S., Martinez, A. M., and Pollak, S. D. (2019). Emotional expressions reconsidered: Challenges to inferring emotion from human facial movements. *Psychological Science in the Public Interest*, 20(1), 1 to 68. [doi:10.1177/1529100619832930](https://doi.org/10.1177/1529100619832930)
- Briganti, G., and Lechien, J. R. (2025). Speech and voice quality as digital biomarkers in depression: A systematic review. *Journal of Voice*. [doi:10.1016/j.jvoice.2025.05.002](https://doi.org/10.1016/j.jvoice.2025.05.002)
- Cummins, N., Scherer, S., Krajewski, J., Schnieder, S., Epps, J., and Quatieri, T. F. (2015). A review of depression and suicide risk assessment using speech analysis. *Speech Communication*, 71, 10 to 49. [doi:10.1016/j.specom.2015.03.004](https://doi.org/10.1016/j.specom.2015.03.004)
- Du, J., Song, J., Xu, Z., Fang, Y., Zhang, Y., Bi, C., Zheng, X., and Shen, B. (2026). MCUD 1.0: A clinical music usage data resource for personalized music therapy. *Scientific Data*. [doi:10.1038/s41597-026-07978-7](https://doi.org/10.1038/s41597-026-07978-7)
- Heiderscheit, A., and Madson, A. (2015). Use of the iso principle as a central method in mood management: A music psychotherapy clinical case study. *Music Therapy Perspectives*, 33(1), 45 to 52. [doi:10.1093/mtp/miu042](https://doi.org/10.1093/mtp/miu042)
- Kroenke, K., Spitzer, R. L., and Williams, J. B. W. (2001). The PHQ-9: Validity of a brief depression severity measure. *Journal of General Internal Medicine*, 16(9), 606 to 613. [doi:10.1046/j.1525-1497.2001.016009606.x](https://doi.org/10.1046/j.1525-1497.2001.016009606.x)
- Lin, Y., Liyanage, B. N., Shi, C., Zhu, Z., Sun, Y., Sun, Y., Zhang, Z. S., Yang, J., Xu, C., Liao, Y., Tao, Y., Li, Z., Zhao, G., and Yue, W. (2026). Speech as a biomarker for supported diagnosis of major depressive disorder using self-supervised representations. *Nature Communications*, 17. [doi:10.1038/s41467-026-74122-9](https://doi.org/10.1038/s41467-026-74122-9)
- Low, D. M., Bentley, K. H., and Ghosh, S. S. (2020). Automated assessment of psychiatric disorders using speech: A systematic review. *Laryngoscope Investigative Otolaryngology*, 5(1), 96 to 116. [doi:10.1002/lio2.354](https://doi.org/10.1002/lio2.354)
- Mazur, A., Costantino, H., Tom, P., Wilson, M. P., and Thompson, R. G. (2025). Evaluation of an AI-based voice biomarker tool to detect signals consistent with moderate to severe depression. *The Annals of Family Medicine*, 23(1), 60 to 65. [doi:10.1370/afm.240091](https://doi.org/10.1370/afm.240091)
- Starcke, K., and von Georgi, R. (2024). Music listening according to the iso principle modulates affective state. *Musicae Scientiae*, 28(1), 131 to 142. [doi:10.1177/10298649231175029](https://doi.org/10.1177/10298649231175029)
