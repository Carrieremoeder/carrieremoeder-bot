// === Design tokens ==========================================================
//
// Eén centrale plek voor kleur, typografie en de gedeelde button-/CTA-varianten
// van de app. Vrijwel alle opmaak in App.jsx staat in inline-styles; die halen
// hun waarden hiervandaan (via het `g`-object) zodat een stijlwijziging op één
// plek gebeurt in plaats van per scherm.
//
// De stijl is licht en editorial: een crème pagina, bijna-witte kaarten met een
// dunne warme rand, serif-koppen, kleine uppercase labels en knoppen die hun
// vorm ontlenen aan een subtiele rand in plaats van een massief bruin vlak.
//
// De donkerbruine merkaccentkleur (#6B5344) en de terracotta steunkleur
// (#B8735A) zijn ONGEWIJZIGD; ze worden alleen subtieler toegepast.

export const kleur = {
  // --- Oppervlakken --------------------------------------------------------
  pagina: "#FBF8F2",        // hele app-achtergrond, header, invoerbalk
  paginaZacht: "#F6F2E9",   // zijbalk en andere licht afwijkende vlakken
  kaart: "#FFFEFC",         // kaarten en contentvlakken
  kaartZacht: "#FCFAF5",    // genest vlak binnen een kaart
  vlakAccent: "#F4EFE5",    // rustige markering (hover, statuslabel)

  // --- Randen --------------------------------------------------------------
  rand: "#EFE9DA",          // standaard kaart-/contentrand
  randStructuur: "#EAE3D2", // header, zijbalk, scheidingen tussen zones
  randVeld: "#E3DCCB",      // formuliervelden: iets duidelijker afgegrensd
  randZacht: "#F4EFE4",

  // --- Tekst ---------------------------------------------------------------
  tekst: "#1C1410",
  tekstZacht: "#5A4E48",
  tekstMeta: "#7A6860",
  // Iets donkerder dan het oude #9A8880: op de lichtere crème achtergrond is
  // dat nodig om kleine uppercase labels leesbaar te houden.
  tekstLicht: "#8C7B6E",
  tekstUitgegrijsd: "#A6968A", // lichtste tint; alleen voor niet-tekstuele accenten
  opWit: "#FFFFFF",            // tekst op een gevuld accentvlak

  // --- Merkaccent (ongewijzigd) --------------------------------------------
  accent: "#6B5344",
  accentDiep: "#5A4433",
  accentSteun: "#B8735A",
  accentRand: "rgba(107, 83, 68, 0.45)",
  accentRandZacht: "rgba(107, 83, 68, 0.22)",
  accentVlakLicht: "#F7F2EA",

  // --- Signaalkleuren (bewust herkenbaar gehouden) -------------------------
  gevaar: "#A6412A",
  gevaarRand: "#D9B4A8",
  gevaarVlak: "#FCF4F1",
  goed: "#2E7D32",
  goedRand: "#BFD8C0",
  goedVlak: "#F2F7F1",
};

export const font = {
  serif: "'Cormorant Garamond', 'Times New Roman', Georgia, serif",
  sans: "'Inter', 'Helvetica Neue', Helvetica, Arial, sans-serif",
};

// Kleine uppercase labels: labels, categorieën, metadata, CTA-tekst. Rond de
// 10-11px met ~1.2px letterspacing — genoeg lucht zonder onleesbaar te worden.
export const label = {
  fontFamily: font.sans,
  fontSize: "10.5px",
  fontWeight: "500",
  letterSpacing: "0.12em",
  textTransform: "uppercase",
  color: kleur.tekstMeta,
};

export const labelKlein = {
  ...label,
  fontSize: "9.5px",
  letterSpacing: "0.14em",
  color: kleur.tekstLicht,
};

// Serif-koppen. Licht gewicht en ruime regelhoogte geven de editorial rust van
// de merksite; de maten zijn bewust groter dan de oude dashboardkoppen.
export const serifKop = (grootte) => ({
  fontFamily: font.serif,
  fontWeight: "300",
  fontSize: grootte,
  letterSpacing: "0.01em",
  lineHeight: 1.2,
  color: kleur.tekst,
});

// === Knop- en CTA-varianten =================================================
//
// A. tekstCta   — navigeren of een secundaire vervolgstap; onderstreping i.p.v.
//                 een knopvlak, met genoeg padding om comfortabel te raken.
// B. actieKnop  — echte app-acties (uploaden, opslaan, koppelen, doorgaan):
//                 licht vlak + duidelijke bruine rand, dus onmiskenbaar een knop.
// C. gevaarKnop — verwijderen en definitief bevestigen: blijft een volle
//                 knopvorm in een signaalkleur.
//
// Alle drie hebben een minimale hoogte zodat het klikoppervlak comfortabel
// blijft, ook al is de tekst zelf klein.

const knopBasis = {
  fontFamily: font.sans,
  fontSize: "10.5px",
  fontWeight: "600",
  letterSpacing: "0.14em",
  textTransform: "uppercase",
  cursor: "pointer",
  borderRadius: 0,
  minHeight: "42px",
  display: "inline-flex",
  alignItems: "center",
  justifyContent: "center",
  gap: "6px",
  lineHeight: 1.3,
  textAlign: "center",
};

export const actieKnop = {
  ...knopBasis,
  padding: "12px 22px",
  background: kleur.accentVlakLicht,
  color: kleur.accentDiep,
  border: `1px solid ${kleur.accentRand}`,
};

export const secundaireKnop = {
  ...knopBasis,
  padding: "11px 18px",
  fontWeight: "500",
  background: "transparent",
  color: kleur.tekstMeta,
  border: `1px solid ${kleur.randVeld}`,
};

export const gevaarKnop = {
  ...knopBasis,
  padding: "12px 20px",
  background: kleur.gevaarVlak,
  color: kleur.gevaar,
  border: `1px solid ${kleur.gevaar}`,
};

// De tekst-CTA: geen vlak, geen kader, wel een dunne onderlijn met ruimte
// tussen tekst en lijn (paddingBottom doet hier wat text-underline-offset doet
// bij een echte underline). De paddingTop houdt het klikoppervlak op ~40px.
export const tekstCta = {
  fontFamily: font.sans,
  fontSize: "10.5px",
  fontWeight: "600",
  letterSpacing: "0.14em",
  textTransform: "uppercase",
  color: kleur.accent,
  background: "none",
  border: "none",
  borderBottom: `1px solid ${kleur.accentRandZacht}`,
  borderRadius: 0,
  padding: "11px 1px 7px",
  minHeight: "38px",
  display: "inline-flex",
  alignItems: "center",
  gap: "7px",
  cursor: "pointer",
  textDecoration: "none",
  lineHeight: 1.3,
};

// Een pictogramknop (bijvoorbeeld de × om iets uit een lijst te halen). Klein
// van vorm, maar met een raakoppervlak van 32px en een tint die het op een
// crème achtergrond ook echt zichtbaar houdt.
export const icoonKnop = {
  background: "none",
  border: "none",
  color: kleur.tekstMeta,
  cursor: "pointer",
  fontSize: "16px",
  lineHeight: 1,
  padding: "6px 8px",
  minWidth: "32px",
  minHeight: "32px",
  display: "inline-flex",
  alignItems: "center",
  justifyContent: "center",
  flexShrink: 0,
  borderRadius: 0,
};

// Dezelfde vorm, maar voor verwijderen: hier mag de signaalkleur wél zichtbaar
// zijn zodat een destructieve actie niet wegvalt in de rustige stijl.
export const icoonKnopGevaar = {
  ...icoonKnop,
  color: kleur.gevaar,
};

// De CSS-variabelen die in GLOBAL_CSS gezet worden. De losse CSS-regels
// (hover, focus, scrollbars, mobiele overrides) verwijzen hiernaar, zodat een
// kleur ook daar niet nog eens los hoeft te worden opgeschreven.
export const TOKENS_CSS = `:root{
--vlak-pagina:${kleur.pagina};
--vlak-pagina-zacht:${kleur.paginaZacht};
--vlak-kaart:${kleur.kaart};
--vlak-kaart-zacht:${kleur.kaartZacht};
--rand:${kleur.rand};
--rand-structuur:${kleur.randStructuur};
--rand-veld:${kleur.randVeld};
--tekst:${kleur.tekst};
--tekst-zacht:${kleur.tekstZacht};
--tekst-meta:${kleur.tekstMeta};
--accent:${kleur.accent};
--accent-diep:${kleur.accentDiep};
--accent-steun:${kleur.accentSteun};
--accent-rand:${kleur.accentRand};
--accent-vlak:${kleur.accentVlakLicht};
--gevaar:${kleur.gevaar};
--font-serif:${font.serif};
--font-sans:${font.sans};
}`;
