/** Unsplash photo IDs — category-themed pools for unique, relevant place images */
const ALL = [
  'photo-1524231757912-21f4fe3a7200', 'photo-1541432901042-2d8bd64b4a9b',
  'photo-1527838832700-5059252407fa', 'photo-1524934498791-1abab2ad1b82',
  'photo-1570939274717-7eda259b50ed', 'photo-1619221882266-8e3da3534b59',
  'photo-1543349689-9a4d426bee8e', 'photo-1499856871958-5b9627545d1a',
  'photo-1570659778048-7b2d2b3b44e1', 'photo-1478436127897-769e1b3f0f36',
  'photo-1542051841857-5f90071e7989', 'photo-1504707416136-f4bc73ff5be0',
  'photo-1570459027562-4a916cc6113f', 'photo-1552832230-c0197dd311b5',
  'photo-1534430480872-3498386e7856', 'photo-1516483638261-f4dbaf036963',
  'photo-1570077188670-e3a8d69ac5ff', 'photo-1555993539-1732b0258235',
  'photo-1539037116277-4db20889f2d4', 'photo-1562883676-8c7feb83f09b',
  'photo-1513635269975-59663e0ac1ad', 'photo-1485871981521-5b1fd3805eee',
  'photo-1474044159687-1ee9f3a51722', 'photo-1513735492246-483525079686',
  'photo-1512453979798-5ea266f8880c', 'photo-1531366936337-7c912a4589a7',
  'photo-1564507592333-c60657eea523', 'photo-1526392060635-9d6019884377',
  'photo-1557652195-1be0ced3be53', 'photo-1539650116574-75c0c6d73f6e',
  'photo-1506973035872-a4ec16b8e8d9', 'photo-1548786811-dd6e453ccca7',
  'photo-1516912481808-3406841bd33c', 'photo-1500402448245-d49c5229c564',
  'photo-1516426122078-c23e76319801', 'photo-1548115184-bc6544d06a58',
  'photo-1528360983277-13d401cdc186', 'photo-1483729558449-99ef09a8c325',
  'photo-1414235077428-338989a2e8c0', 'photo-1495474472287-4d71bcdd2085',
  'photo-1507525428034-b723cf961d3e', 'photo-1506905925346-21bda4d32df4',
  'photo-1582555172866-f73bb12a2ab3', 'photo-1441986300917-64674bd600d8',
  'photo-1514525253161-7a46d19cd819', 'photo-1544161515-4ab6ce6db874',
  'photo-1523906834658-6e24ef2386f2', 'photo-1469854523086-cc02fe5d8800',
  'photo-1501594907352-04cda38ebc29', 'photo-1518548419976-58e722b42a25',
  'photo-1533929733737-8ceef46a2b1e', 'photo-1502602898657-3e91760cbb34',
  'photo-1496568816309-51d28a466a3e', 'photo-1476514525535-07fb3f4f5bb1',
  'photo-1500534314209-a25ddb2bd429', 'photo-1519681393784-d120267933ba',
  'photo-1432405972618-60b26654430a', 'photo-1454496524508-480b829f666e',
  'photo-1488085068339-322e9eca5274', 'photo-1526779256847-adf941079f4c',
  'photo-1469474968028-56623f02e42e', 'photo-1501785888041-7c9e77ae0efb',
  'photo-1506197603052-166f52c9b186', 'photo-1518837695005-20830993ee35',
  'photo-1475924156734-496f6b6c96a5', 'photo-1502920917128-1aa500764b9d',
  'photo-1528183429752-a97fa0ceed99', 'photo-1551632811-561732d1e306',
  'photo-1540959733332-eab4deabeeaf', 'photo-1559827260-dc66d52bef19',
  'photo-1566073771259-6a8506099945', 'photo-1571896349842-33c89424de2d',
  'photo-1582719508461-905c673771f5', 'photo-1596422846544-e75c64220b66',
  'photo-1605649487212-47bdab064ff7', 'photo-1613395877348-5b30391f0e8b',
  'photo-1626621346668-75a8124a9706', 'photo-1633332753011-5faae6a6e1e1',
  'photo-1505764708715-816eaff77e7f', 'photo-1527004013197-6c8a0a4b0f1d',
  'photo-1533104860435-b7e10151625d', 'photo-1537996194471-d033025128c9',
  'photo-1544551763-46a013bb70d5', 'photo-1551884170-09c70cdfebc5',
  'photo-1560960884-ba7ba7b4b8b4', 'photo-1565008576549-57569a49371d',
  'photo-1573843981267-be1999ff37cd', 'photo-1580137189270-5ba3809eae51',
  'photo-1590523277543-a94c946e855a', 'photo-1609137144819-7d065133413f',
  'photo-1614595205911-873178b29335', 'photo-1622396484209-8167cf773aeb',
  'photo-1631049307264-da03ec8d1a88', 'photo-1643728016859-93932230409c',
  'photo-1504280390367-361c6d9f38f4', 'photo-1520250497591-841c03a94d4c',
  'photo-1528127269322-539801943592', 'photo-1534351596116-0c6a194f0bbd',
  'photo-1548199973-03cce0bbc87a', 'photo-1555881400-74d7acaacd8b',
  'photo-1575320181282-8732b47497ef', 'photo-1587595431973-160d0d94add3',
  'photo-1596435207879-2ce803a0e9c5', 'photo-1606761568499-6d2452b37b24',
  'photo-1618221195710-e06f59e5bc17', 'photo-1625244724120-1fd1d34e00c6',
  'photo-1633957606199-38fa0eeb6f08', 'photo-1642388812268-65290b80a333',
  'photo-1682687220063-4742bd6fd385', 'photo-1692683982642-92a1e4268afc',
];

const BY_CATEGORY = {
  landmark: [
    'photo-1552832230-c0197dd311b5', 'photo-1513635269975-59663e0ac1ad',
    'photo-1502920917128-1aa500764b9d', 'photo-1524231757912-21f4fe3a7200',
    'photo-1543349689-9a4d426bee8e', 'photo-1534430480872-3498386e7856',
    'photo-1516483638261-f4dbaf036963', 'photo-1564507592333-c60657eea523',
    'photo-1526392060635-9d6019884377', 'photo-1474044159687-1ee9f3a51722',
  ],
  museum: [
    'photo-1582555172866-f73bb12a2ab3', 'photo-1565008576549-57569a49371d',
    'photo-1573843981267-be1999ff37cd', 'photo-1540959733332-eab4deabeeaf',
    'photo-1613395877348-5b30391f0e8b', 'photo-1562883676-8c7feb83f09b',
    'photo-1526779256847-adf941079f4c', 'photo-1596422846544-e75c64220b66',
  ],
  beach: [
    'photo-1507525428034-b723cf961d3e', 'photo-1506905925346-21bda4d32df4',
    'photo-1476514525535-07fb3f4f5bb1', 'photo-1500534314209-a25ddb2bd429',
    'photo-1544551763-46a013bb70d5', 'photo-1519681393784-d120267933ba',
    'photo-1559827260-dc66d52bef19', 'photo-1571896349842-33c89424de2d',
  ],
  nature: [
    'photo-1506905925346-21bda4d32df4', 'photo-1469474968028-56623f02e42e',
    'photo-1501785888041-7c9e77ae0efb', 'photo-1432405972618-60b26654430a',
    'photo-1454496524508-480b829f666e', 'photo-1505764708715-816eaff77e7f',
    'photo-1528183429752-a97fa0ceed99', 'photo-1551632811-561732d1e306',
  ],
  restaurant: [
    'photo-1414235077428-338989a2e8c0', 'photo-1542051841857-5f90071e7989',
    'photo-1565299624946-b28f40a0ae38', 'photo-1511920170033-f8396924c348',
    'photo-1552566626-cfe83e0b1370', 'photo-1504674900247-0877df9cc836',
  ],
  cafe: [
    'photo-1495474472287-4d71bcdd2085', 'photo-1442512595331-e89e73853f31',
    'photo-1509042239860-f550ce710b93', 'photo-1498808672582-a7271f0e7b11',
    'photo-1511920170033-f8396924c348', 'photo-1501339847302-ac426a4a7cbb',
  ],
  park: [
    'photo-1485871981521-5b1fd3805eee', 'photo-1518837695005-20830993ee35',
    'photo-1506197603052-166f52c9b186', 'photo-1580137189270-5ba3809eae51',
    'photo-1590523277543-a94c946e855a', 'photo-1609137144819-7d065133413f',
  ],
  viewpoint: [
    'photo-1570077188670-e3a8d69ac5ff', 'photo-1502920917128-1aa500764b9d',
    'photo-1475924156734-496f6b6c96a5', 'photo-1502602898657-3e91760cbb34',
    'photo-1488085068339-322e9eca5274', 'photo-1537996194471-d033025128c9',
  ],
  religious: [
    'photo-1478436127897-769e1b3f0f36', 'photo-1541432901042-2d8bd64b4a9b',
    'photo-1564507592333-c60657eea523', 'photo-1513735492246-483525079686',
    'photo-1582719508461-905c673771f5', 'photo-1614595205911-873178b29335',
  ],
  market: [
    'photo-1527838832700-5059252407fa', 'photo-1555881400-74d7acaacd8b',
    'photo-1575320181282-8732b47497ef', 'photo-1587595431973-160d0d94add3',
    'photo-1524934498791-1abab2ad1b82', 'photo-1570939274717-7eda259b50ed',
  ],
  shopping: [
    'photo-1441986300917-64674bd600d8', 'photo-1483985988355-763728e1935b',
    'photo-1472851294608-062f824d29cc', 'photo-1445205170230-053b83016050',
    'photo-1469334031218-e382a71b716b', 'photo-1523381291771-6a62bb1c4373',
  ],
  nightlife: [
    'photo-1514525253161-7a46d19cd819', 'photo-1493225457124-a3eb161ffa5f',
    'photo-1511379934351-8b7cf4c1d1a0', 'photo-1470229722913-7c0e2dbbafd3',
    'photo-1571266023761-6d163b0c5a4e', 'photo-1516450360452-9312f5e86fc7',
  ],
  adventure: [
    'photo-1516912481808-3406841bd33c', 'photo-1506905925346-21bda4d32df4',
    'photo-1551632811-561732d1e306', 'photo-1533104860435-b7e10151625d',
    'photo-1682687220063-4742bd6fd385', 'photo-1527004013197-6c8a0a4b0f1d',
  ],
  spa: [
    'photo-1544161515-4ab6ce6db874', 'photo-1540555700478-4be289fbecef',
    'photo-1570172619644-dfd955d6790d', 'photo-1619451337114-aa0d981d0cfc',
    'photo-1544161515-4ab6ce6db874', 'photo-1600334089648-b0d9d3028eb2',
  ],
};

function dedupe(arr) {
  return [...new Set(arr)];
}

const ALL_UNIQUE = dedupe(ALL);

function poolForCategory(category) {
  const cat = BY_CATEGORY[category];
  if (cat && cat.length >= 4) return dedupe(cat);
  return ALL_UNIQUE;
}

function photoUrl(pid, variant = 0) {
  const base = `https://images.unsplash.com/${pid}?w=600&q=80&auto=format&fit=crop`;
  if (!variant) return base;
  const fp = ((variant * 17) % 80 + 10) / 100;
  return `${base}&crop=focalpoint&fp-x=${fp.toFixed(2)}&fp-y=0.50`;
}

function hashStr(s) {
  let h = 2166136261;
  for (const ch of String(s)) {
    h ^= ch.charCodeAt(0);
    h = Math.imul(h, 16777619);
  }
  return Math.abs(h);
}

/** Assign unique, category-relevant imageUrl per place */
function assignUniqueImages(places) {
  const used = new Set();
  const indexed = places.map((p, idx) => ({ p, idx, id: p.id || idx + 1 }));
  indexed.sort((a, b) => a.id - b.id);
  const out = new Array(places.length);

  for (const { p, idx, id } of indexed) {
    const pool = poolForCategory(p.category);
    const seed = hashStr(`${id}|${p.name}|${p.category}`);
    let chosen = null;

    for (let variant = 0; variant < 12 && !chosen; variant++) {
      for (let i = 0; i < pool.length; i++) {
        const url = photoUrl(pool[(seed + i) % pool.length], variant);
        if (!used.has(url)) {
          chosen = url;
          break;
        }
      }
    }

    if (!chosen) {
      chosen = photoUrl(pool[seed % pool.length], seed % 100);
    }

    used.add(chosen);
    out[idx] = { ...p, imageUrl: chosen };
  }

  return out;
}

/** Pick fallback URL when imageUrl is missing — varies by place id + category */
function fallbackImageUrl(category, placeId = 0) {
  const pool = poolForCategory(category);
  const seed = hashStr(`${placeId}|${category}|fallback`);
  return photoUrl(pool[seed % pool.length], (placeId * 3) % 8);
}

module.exports = {
  ALL: ALL_UNIQUE,
  BY_CATEGORY,
  poolForCategory,
  photoUrl,
  hashStr,
  assignUniqueImages,
  fallbackImageUrl,
};
