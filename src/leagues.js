// API-Sports league ids shown first and open, in this order. Everything else
// falls into "Other competitions", grouped by country and collapsed.
const TOP = [
    1,   // World Cup
    15,  // FIFA Club World Cup
    4,   // Euro Championship
    9,   // Copa America
    6,   // Africa Cup of Nations
    2,   // UEFA Champions League
    3,   // UEFA Europa League
    848, // UEFA Conference League
    531, // UEFA Super Cup
    5,   // UEFA Nations League
    32,  // WC Qualification Europe
    34,  // WC Qualification South America
    29,  // WC Qualification Africa
    30,  // WC Qualification Asia
    31,  // WC Qualification CONCACAF
    39,  // Premier League
    140, // La Liga
    135, // Serie A
    78,  // Bundesliga
    61,  // Ligue 1
    45,  // FA Cup
    48,  // EFL Cup
    143, // Copa del Rey
    137, // Coppa Italia
    81,  // DFB Pokal
    66,  // Coupe de France
    40,  // Championship
    88,  // Eredivisie
    94,  // Primeira Liga
    203, // Süper Lig
    307, // Saudi Pro League
    17,  // AFC Champions League
    13,  // Copa Libertadores
    11,  // Copa Sudamericana
    253, // MLS
    262, // Liga MX
    71,  // Brasileirão Serie A
    128, // Liga Profesional Argentina
    10,  // International friendlies
];

const rank = new Map(TOP.map((id, i) => [id, i]));

module.exports = { isTop: id => rank.has(id), topRank: id => rank.get(id) ?? Infinity };
