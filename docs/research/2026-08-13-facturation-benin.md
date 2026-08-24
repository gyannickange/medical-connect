# Obligations légales et techniques de facturation au Bénin — recherche pour StockFlow

Date de la recherche : 2026-08-13

## Résumé exécutif

**Oui, le Bénin a un dispositif de facturation électronique/certifiée obligatoire, en vigueur depuis 2018 et progressivement généralisé à tous les contribuables (y compris les plus petits, régime TPS) depuis le 1er juillet 2021.** Il s'agit du **MECeF** (Machine Électronique Certifiée de Facturation), dont la version dématérialisée s'appelle **e-MECeF**. La réforme a été autorisée par décision du Conseil des ministres du 27 septembre 2017, formalisée par l'arrêté n° 711-C/MEF/DC/SGM/DGI/DIE/DLC/070SGG18 du 5 mars 2018, avec un démarrage effectif dès le 30 mars 2018 pour certains contribuables assujettis à la TVA, puis une généralisation progressive jusqu'à couvrir, depuis le 1er juillet 2021, les contribuables du régime simplifié TPS (fin du moratoire qui leur avait été accordé). Le dispositif est piloté par la **Direction Générale des Impôts (DGI) du Bénin**, via le portail officiel [e-mecef.impots.bj](https://e-mecef.impots.bj/).

Concrètement, toute entreprise assujettie à la TVA (moyennes et grandes entreprises, plus les petites entreprises ayant opté pour la TVA), et depuis juillet 2021 les contribuables du régime TPS également, doit émettre ses factures via une machine certifiée physique (Unité de Facturation « UF », ou Module de Contrôle de Facturation « MCF ») ou via la plateforme dématérialisée e-MECeF, avec transmission des données à la DGI. Un logiciel de caisse tiers (comme StockFlow) peut en théorie s'interfacer avec e-MECeF (le portail mentionne un « Système de Facturation d'Entreprise » — SFE — devant être approuvé par la DGI), mais je n'ai **pas trouvé de documentation technique d'intégration (API/protocole) directement accessible et vérifiée** dans le temps imparti à cette recherche — voir plus bas.

La TVA béninoise est de **18 %** (source secondaire uniquement, à confirmer via le Code Général des Impôts). Le seuil qui sépare le régime réel du régime simplifié (Taxe Professionnelle Synthétique, TPS) est de **50 millions de FCFA** de chiffre d'affaires annuel.

Ce dispositif n'est pas isolé : plusieurs pays de la région (Côte d'Ivoire, Sénégal, Cameroun, Congo-Brazzaville, RDC) ont des systèmes analogues, à des stades de maturité différents — voir la section comparaison régionale.

## Obligations légales identifiées

### Cadre légal et chronologie

| Étape | Date | Source |
| --- | --- | --- |
| Décision du Conseil des ministres autorisant la réforme | 27 septembre 2017 | gouv.bj |
| Arrêté instituant la facture normalisée | Arrêté n° 711-C/MEF/DC/SGM/DGI/DIE/DLC/070SGG18 du 5 mars 2018 | impots.finances.gouv.bj (repéré via recherche, contenu résumé par un moteur de recherche IA — à confirmer par lecture directe) |
| Démarrage effectif pour une partie des assujettis TVA | 30 mars 2018 | impots.finances.gouv.bj |
| Phase pilote élargie | avril 2018 | gouv.bj |
| Généralisation de la réforme (poursuite) | 2 décembre 2019 *(gouv.bj)* — ou 1er avril 2020 pour les moyennes/grandes entreprises *(CIO-MAG)* | gouv.bj / CIO-MAG — **dates divergentes, voir incertitudes** |
| Date butoir de mise en conformité (grandes/moyennes entreprises) | 29 février 2020 | gouv.bj |
| Gestion dématérialisée (e-MECeF) opérationnelle | 1er février 2021 | CIO-MAG |
| Extension aux contribuables du régime TPS (fin du moratoire) | 1er juillet 2021, annoncée par circulaire du DG des Impôts (Nicolas Yenoussi) du 23 avril 2021 | gouv.bj (« Entrée des TPS dans la réforme des factures normalisées »), lanouvelletribune.info, leconomistebenin.com |
| Textes de référence | Lois de finances 2018, 2019 et 2020 ; arrêté n° 711-C du 5 mars 2018 ; Code Général des Impôts (article 1096 pour les sanctions) | gouv.bj, impots.finances.gouv.bj, CIO-MAG |

Le Code Général des Impôts du Bénin a par ailleurs été refondu récemment (version consolidée 2025 publiée sur finances.bj), mais je n'ai pas eu le temps de vérifier dans ce texte si les dispositions MECeF ont été renumérotées ou modifiées.

### Mentions obligatoires sur une facture normalisée

Selon gouv.bj et un résumé (obtenu par recherche, non lu en intégralité) de l'arrêté n° 711-C du 5 mars 2018, une facture normalisée béninoise doit comporter :

- le numéro de facture et la date d'établissement ;
- le nom/la raison sociale, l'**IFU (Identifiant Fiscal Unique)** et l'adresse du vendeur ;
- le nom, la raison sociale, l'adresse et l'IFU de l'acheteur ;
- la quantité, la désignation précise et le prix unitaire des biens/services vendus, prix unitaire et total ;
- le montant de la facture TTC (TVA incluse) ;
- le **numéro d'identification de la machine (NIM)** ;
- une **signature électronique** ;
- un **code électronique** de sécurité.

L'IFU du contribuable est requis pour pouvoir émettre des factures normalisées via e-MECeF. **Note de prudence** : la liste détaillée ci-dessus provient d'un résumé automatique de résultats de recherche citant l'arrêté 711-C, pas d'une lecture directe du texte réglementaire — le texte source n'a pas été ouvert et vérifié mot pour mot dans cette recherche.

### Seuils d'assujettissement

- **Régime du réel** : chiffre d'affaires annuel > 50 millions FCFA.
- **Taxe Professionnelle Synthétique (TPS)**, régime simplifié pour petites entreprises : chiffre d'affaires annuel ≤ 50 millions FCFA. Les sources consultées se contredisent sur le taux exact appliqué selon la tranche de chiffre d'affaires (une source indique 5 % du CA, une autre indique 2 % pour la tranche 20-50 millions FCFA) — **je n'ai pas pu trancher cette contradiction avec les sources disponibles**, voir la section incertitudes. Deux guides officiels PDF existent sur ce sujet (voir sources primaires) mais n'ont pas pu être extraits/lus dans le temps imparti.
- Obligation MECeF/facture normalisée : s'applique désormais (depuis le 1er juillet 2021) à **tous les régimes fiscaux**, y compris la TPS — pas seulement aux assujettis à la TVA comme c'était le cas à l'origine de la réforme en 2018-2020. Un seuil spécifique de 50 millions FCFA est aussi cité pour les **consultants individuels**. Les agriculteurs vendant directement leurs produits sont exonérés.

### TVA au Bénin

Taux de **18 %** cité par plusieurs sources secondaires (village-justice.com, ayido.africa) référençant le Code Général des Impôts, mais **non vérifié directement dans le texte légal** lors de cette recherche (le PDF du CGI 2025 sur finances.bj n'a pas été consulté en détail — voir sources primaires ci-dessous pour le lien exact à vérifier).

### Sanctions en cas de non-conformité

D'après l'article 1096 du Code Général des Impôts (cité par CIO-MAG, source secondaire mais citant un article de loi précis) :

- 1ère infraction : amende égale à 10 fois la TVA éludée, minimum 1 million FCFA par opération.
- Récidive : amende égale à 20 fois la TVA éludée (minimum 2 millions FCFA) + fermeture administrative de 3 mois (fermeture définitive en cas de nouvelle récidive).

## Dispositif technique

**Nom** : MECeF (Machine Électronique Certifiée de Facturation) / e-MECeF pour la version dématérialisée.

**Fonctionnement** — trois modalités possibles pour les contribuables :

1. **Unité de Facturation (UF)** : petite machine autonome avec imprimante intégrée.
2. **Module de Contrôle de Facturation (MCF)** : boîtier à connecter à un ordinateur/système de caisse existant.
3. **e-MECeF** : plateforme en ligne dématérialisée ([e-mecef.impots.bj](https://e-mecef.impots.bj/)), accessible sans matériel physique dédié.

Toutes les machines physiques embarquent une carte SIM et une connexion internet pour transmettre les données de facturation en temps réel à la DGI (selon gouv.bj).

**Intégration logicielle tierce** : le portail e-MECeF distingue deux parcours d'inscription — les contribuables sans SFE (Système de Facturation d'Entreprise) ou avec un SFE déjà approuvé, et les développeurs/éditeurs disposant d'un SFE **non encore approuvé** par la DGI, qui doivent passer par un processus de validation/tests avant homologation. Un résumé automatique du contenu du portail (obtenu via un outil de récupération de page, donc à confirmer manuellement) mentionne une « plateforme de test dédiée aux développeurs », une documentation API, et des SDK — **mais je n'ai pas pu confirmer ce point directement avec une capture du contenu texte brut de la documentation** (le portail semble être une application interactive dont le contenu n'est pas entièrement extractible par simple récupération de page). Contact officiel du support DGI pour le dispositif : `mecefbenin@finances.bj`, tél. +229 21 30 35 22 / +229 94 95 44 15.

**Point à vérifier avant toute intégration réelle** : l'existence, le format exact et les conditions d'accès à une véritable spécification API publique (authentification, format des requêtes, environnement de test) n'ont pas pu être confirmés avec un niveau de confiance élevé dans cette recherche — il faudrait contacter la DGI ou s'inscrire sur le portail e-MECeF pour obtenir cette documentation de première main.

## Sources primaires

- [Tout savoir sur les factures normalisées au Bénin](https://www.gouv.bj/article/522/tout-savoir-sur-les-factures-normalisees-au-benin/) — Portail officiel du Gouvernement du Bénin. Article de référence détaillant la chronologie de la réforme, les mentions obligatoires, les seuils, les sanctions (article 1096 CGI) et les mesures incitatives. Source primaire la plus complète et la plus fiable trouvée.
- [e-mecef.impots.bj](https://e-mecef.impots.bj/) — Portail officiel e-MECeF de la DGI Bénin. Plateforme opérationnelle confirmant l'existence réelle du dispositif ; contenu détaillé (documentation développeur) non entièrement vérifiable par simple extraction de page.
- [Entrée des TPS dans la réforme des factures normalisées](https://www.gouv.bj/actualite/1318/entree-dans-reforme-factures-normalisees-rend-justice-consommateurs/) — Portail officiel du Gouvernement du Bénin, confirmant l'extension de l'obligation MECeF aux contribuables du régime TPS à partir du 1er juillet 2021.
- [Obligation pour toutes les entreprises de délivrer des factures normalisées au moyen des MECeF](http://www.impots.finances.gouv.bj/obligation-pour-toutes-les-entreprises-de-delivrer-des-factures-normalisees-au-moyen-des-mecef/) et le domaine [impots.finances.gouv.bj](https://www.impots.finances.gouv.bj/) — Site officiel de la DGI Bénin, source de l'arrêté n° 711-C/MEF/DC/SGM/DGI/DIE/DLC/070SGG18 du 5 mars 2018 (référence repérée par recherche, non lue intégralement — à confirmer par consultation directe). Le PDF « FICHE-GÉNÉRALISATION-MECeF-DGI.pdf » ([lien](https://www.impots.finances.gouv.bj/wp-content/uploads/2020/02/FICHE-GÉNÉRALISATION-MECeF-DGI.pdf)) existe mais s'est révélé être un PDF scanné/image, illisible par extraction automatique dans cette recherche — à consulter manuellement (visuellement) si besoin de détail supplémentaire.
- [Guide pratique sur la Taxe Professionnelle Synthétique](https://api.impots.bj/media/619df81851533_PROJET%20DE%20PLAQUETTE%20SUR%20LA%20TPS.pdf) et [Guide simplifié sur la TPS](https://www.impots.finances.gouv.bj/wp-content/uploads/2020/02/GUIDE-SIMPLIFIÉ-SUR-LA-TPS.pdf) — Guides officiels DGI sur la Taxe Professionnelle Synthétique, non consultés en détail (identifiés par recherche mais non extraits) — à ouvrir en priorité pour lever l'incertitude sur les taux TPS par tranche.
- [Code Général des Impôts du Bénin, version 2025](https://finances.bj/wp-content/uploads/2025/01/Benin-Code-General-des-Impots-2025.pdf) — publié par le Ministère de l'Économie et des Finances. Source primaire de premier ordre pour vérifier le taux de TVA exact et le texte actuel des dispositions MECeF ; identifié mais non consulté en détail dans cette recherche.
- [fne.dgi.gouv.ci](https://www.fne.dgi.gouv.ci/) — Portail officiel de la DGI Côte d'Ivoire pour la Facture Normalisée Électronique (FNE), utilisé pour la comparaison régionale.
- [Lancement de la facture normalisée (phase test)](https://www.finances.gouv.cg/fr/lancement-facture-normalis%C3%A9e_010221) — Ministère des Finances du Congo-Brazzaville, article officiel sur le lancement en phase test de la facture normalisée électronique à Brazzaville (janvier 2021).
- [dgi.gouv.cd](https://www.dgi.gouv.cd/) et [dgi.gouv.cd/facture-normalisee](https://www.dgi.gouv.cd/facture-normalisee/) — Site officiel de la DGI de la République Démocratique du Congo (RDC), à ne pas confondre avec le Congo-Brazzaville.

## Sources secondaires utilisées (à défaut de primaire vérifiable)

- [CIO MAG, « Comprendre la réforme des factures normalisées au Bénin »](https://cio-mag.com/comprendre-la-reforme-des-factures-normalisees-au-benin/) — média spécialisé tech Afrique, cite des dates et l'article 1096 du CGI ; recoupe globalement gouv.bj mais donne des dates de généralisation différentes.
- [La Nouvelle Tribune, « Bénin : la facture normalisée exigée aux personnes assujetties à la TPS dès le 1er juillet »](https://lanouvelletribune.info/2021/04/benin-la-facture-normalisee-exigee-aux-personnes-assujetties-a-la-tps-des-le-1er-juillet/) et [L'Économiste Bénin, article équivalent](https://leconomistebenin.com/2021/04/26/factures-normalisees-la-delivrance-elargie-aux-personnes-du-regime-tps-des-le-1er-juillet-2021/) — presse spécialisée béninoise, recoupant l'annonce officielle gouv.bj sur l'extension aux TPS.
- village-justice.com, article de Julien Coomlan Hounkpe (juriste) sur le nouveau Code Général des Impôts béninois — cité pour le taux de TVA de 18 %, à recouper avec le texte légal lui-même.
- ayido.africa, « La fiscalité des entreprises au Bénin » — blog spécialisé, cité pour les seuils TPS/réel, à recouper avec les guides DGI officiels.
- [Dexy Africa, « Facturation électronique – Bénin »](https://www.dexyafrica.com/facturation-electronique-benin/) — société spécialisée en facturation électronique en Afrique, identifiée mais non consultée en détail.
- [Faktoo Bénin](https://faktoo.bj/) et [geCloud](https://gecloud.me/) — éditeurs de logiciels commerciaux annonçant une intégration e-MECeF certifiée ; utile comme indice que l'intégration tierce est possible en pratique, mais ce sont des sources commerciales, pas des sources faisant autorité sur les règles elles-mêmes.
- [KOACI, « Côte d'Ivoire : fin de l'usage de la facture normalisée physique et nouvelle disposition »](https://www.koaci.com/article/2025/12/23/cote-divoire/economie/cote-divoire-impots-fin-de-lusage-de-la-facture-normalisee-physique-et-nouvelle-disposition_193092.html) — presse spécialisée, source de la date du 1er décembre 2025 pour l'obligation FNE généralisée en Côte d'Ivoire.

## Comparaison rapide avec les pays voisins

- **Côte d'Ivoire** : dispositif **FNE (Facture Normalisée Électronique)**, piloté par la DGI via [fne.dgi.gouv.ci](https://www.fne.dgi.gouv.ci/). Déploiement progressif depuis juin 2025 (grandes entreprises d'abord, arrêté ministériel n°0337 du 9 mai 2025), puis obligation étendue à **toutes les entreprises sans exception de régime fiscal** à partir du 1er décembre 2025 (régime normal), 11 décembre 2025 (micro-entreprises) et 22 décembre 2025 (régime « Entreprenant »), selon un communiqué officiel de la DGI. Fonctionne selon un modèle de type « clearance » : chaque facture doit être validée en temps réel par la plateforme DGI (tampon fiscal électronique + QR code) avant d'être remise au client — un des dispositifs les plus stricts et les plus récents de la région.
- **Sénégal** : la DGID (Direction Générale des Impôts et des Domaines) déploie progressivement une facturation électronique normalisée (numérotation séquentielle, transmission électronique à la DGID, mentions NINEA/RCCM obligatoires, conformité SYSCOHADA, archivage 10 ans), en commençant par les grandes entreprises. Fait notable trouvé lors de la recherche (source secondaire, non vérifiée en primaire) : une mission sénégalaise se serait rendue à la DGI du Bénin du 22 au 24 août 2023 pour échanger sur la réforme de la facture normalisée électronique, suggérant une coopération régionale directe entre les deux administrations.
- **Congo-Brazzaville** : dispositif **SFEC (Système de Facturation Électronique Certifiée)**, lancé en phase test à Brazzaville (source officielle : ministère des Finances congolais, janvier 2021) — certification en temps réel par les serveurs de la DGI, QR code. Attention à ne pas confondre avec la **RDC**, qui a lancé sa propre réforme de « facture normalisée » plus récemment (fin 2025 selon la presse et le site officiel de la DGI-RDC), pilotée par une administration fiscale distincte (DGI-RDC, `dgi.gouv.cd`).
- **Cameroun** : la DGI camerounaise déploie un dispositif de facture normalisée / « Dispositif Électronique Fiscal » avec un NIU (Numéro d'Identifiant Unique) obligatoire, déploiement par étapes en commençant par les grandes entreprises du régime réel. **Confiance plus faible sur ce point** : les résultats de recherche se sont partiellement mélangés avec ceux de la RDC (dispositifs au nom proche), et je n'ai pas identifié de page officielle camerounaise (`impots.cm`) confirmant explicitement le nom exact et la date du dispositif — à vérifier directement sur impots.cm si cette comparaison devient pertinente.

## Implications pour StockFlow (factuel, sans recommandation)

Si StockFlow devait un jour être utilisé par des commerçants au Bénin pour émettre des factures fiscalement valables :

- Les commerçants assujettis à la TVA (ou ayant opté pour la TVA) auraient l'obligation légale d'émettre des factures normalisées via le dispositif MECeF/e-MECeF, et non des factures « libres » générées uniquement par un logiciel non homologué.
- Un logiciel de caisse comme StockFlow devrait, pour émettre des factures valides pour ces commerçants, soit s'interfacer avec e-MECeF en tant que SFE (Système de Facturation d'Entreprise) homologué par la DGI, soit renvoyer les commerçants vers l'usage direct de la plateforme e-MECeF ou d'un boîtier UF/MCF physique.
- Les commerçants sous le seuil de la TPS (CA ≤ 50 millions FCFA) sont, depuis le 1er juillet 2021, également soumis à l'obligation de facture normalisée (fin du moratoire dont ils bénéficiaient) — StockFlow ne pourrait donc pas se reposer sur une exemption liée à la petite taille des commerçants ciblés si le marché béninois était visé.
- Les modalités techniques précises d'intégration (API, authentification, format d'échange) n'ont pas pu être confirmées avec un niveau de confiance suffisant dans cette recherche — un contact direct avec la DGI ou une inscription développeur sur e-MECeF serait nécessaire avant toute tentative d'intégration technique.
- Le non-respect de l'obligation expose, selon les sources trouvées, à des amendes significatives (basées sur un multiple de la TVA éludée, avec un plancher en FCFA) et, en cas de récidive, à une fermeture administrative — un facteur de risque pertinent si des commerçants béninois utilisaient StockFlow sans dispositif conforme.

## Addendum : cas du secteur santé / hôpitaux (2026-08-14)

Question posée en suivi : les hôpitaux sont-ils concernés par l'obligation MECeF/e-MECeF ?

**Aucune source trouvée (primaire ou secondaire) ne traite explicitement du secteur santé ou des hôpitaux au Bénin.** Ce qui est confirmé, c'est que le déclencheur de l'obligation n'est **pas sectoriel** mais lié au statut fiscal : gouv.bj et un résumé du portail e-MECeF indiquent que l'obligation s'applique à "toute entreprise assujettie à la TVA, quel que soit son secteur (commerce, services, BTP, industrie)", et que "les entreprises non assujetties à la TVA ne sont pas concernées" (à l'origine de la réforme) — étendue depuis le 1er juillet 2021 à tous les régimes fiscaux (voir chronologie plus haut).

Conséquence probable (raisonnement, pas une source directe) :
- **Cliniques privées / cabinets médicaux** organisés en entreprise assujettie à la TVA ou relevant du régime réel/TPS : rien dans les sources trouvées ne les exclut — a priori soumis comme n'importe quelle entreprise.
- **Hôpitaux publics** (établissements publics administratifs, pas des "entreprises" au sens commercial) : probablement hors champ tel que formulé, mais **non confirmé** par une source béninoise explicite.
- Inconnue non vérifiée : si les soins médicaux sont exonérés de TVA au Bénin (schéma courant dans la zone OHADA), une structure de soins pourrait échapper au déclencheur "assujetti TVA" — mais l'extension de 2021 à "tous les régimes fiscaux" pourrait quand même la couvrir. Le texte des exonérations TVA du Code Général des Impôts béninois (finances.bj, CGI 2025) n'a pas été consulté pour vérifier ce point.

**À vérifier avant toute conclusion ferme** : le chapitre "exonérations" du CGI béninois (articles sur les opérations exonérées de TVA, secteur santé) et une confirmation directe auprès de la DGI (`mecefbenin@finances.bj`) sur le traitement des établissements de santé publics et privés.

## Niveau de confiance / zones d'incertitude

- **Confiance élevée** : l'existence du dispositif MECeF/e-MECeF au Bénin, son pilotage par la DGI, la nécessité de l'IFU, les mentions obligatoires (NIM, signature, code électronique) — confirmés par une source gouvernementale officielle (gouv.bj) recoupée par une source secondaire spécialisée (CIO-MAG).
- **Confiance moyenne** : le taux de TVA de 18 % et les seuils/taux exacts de la TPS — reposent sur des sources secondaires (blogs juridiques/fiscaux) non recoupées directement avec le texte du Code Général des Impôts dans cette recherche, malgré l'identification du PDF officiel du CGI 2025. Les deux sources trouvées sur la TPS se contredisent sur le taux applicable par tranche de chiffre d'affaires.
- **Confiance faible à moyenne** : l'existence et le contenu exact d'une documentation API/protocole d'intégration développeur pour e-MECeF — le portail semble en proposer une (mention de « plateforme de test », « SDK », « documentation API » dans un résumé automatique de page), mais je n'ai pas pu extraire ni confirmer le contenu texte brut de cette documentation dans le temps imparti à cette recherche.
- **Dates de généralisation contradictoires** : gouv.bj indique une généralisation commencée le 2 décembre 2019 avec date butoir au 29 février 2020, tandis que CIO-MAG indique une obligation démarrée le 1er avril 2020 pour les moyennes/grandes entreprises, avec gestion dématérialisée opérationnelle seulement à partir du 1er février 2021. Ces deux sources ne sont pas nécessairement incompatibles (elles pourraient décrire des étapes différentes de la même réforme progressive), mais je n'ai pas pu établir une chronologie unique et certaine.
- **Comparaison régionale** : le Sénégal, la Côte d'Ivoire et le Congo-Brazzaville sont bien confirmés avec au moins une source officielle ou quasi-officielle. Le Cameroun reste la comparaison la moins solide de cette recherche — les résultats de recherche se sont mélangés avec ceux de la RDC, et aucune page officielle camerounaise n'a été directement consultée.
- **PDF non exploitables** : le document officiel « FICHE-GÉNÉRALISATION-MECeF-DGI.pdf » de la DGI Bénin s'est révélé être un scan/image non extractible automatiquement — il contient potentiellement des informations plus précises (procédure, spécifications techniques) qui n'ont pas pu être récupérées dans cette recherche.
- **Recommandation pour une prochaine étape** si une conformité réelle devient nécessaire : (1) ouvrir manuellement le PDF FICHE-GÉNÉRALISATION-MECeF-DGI et les deux guides TPS identifiés ci-dessus ; (2) consulter directement le Code Général des Impôts 2025 (finances.bj) pour le taux de TVA et le texte légal exact des articles MECeF ; (3) contacter directement la DGI (`mecefbenin@finances.bj`) ou s'inscrire comme développeur sur e-MECeF pour obtenir la documentation d'intégration réelle, plutôt que de se fier aux résumés obtenus dans cette recherche.
