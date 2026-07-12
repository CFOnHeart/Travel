const DESTINATION_NAMES = ['西双版纳', '丽江', '泸沽湖', '昆明', '大理', '香格里拉', '玉龙雪山'];

function sectionText(section) {
  return JSON.stringify(section || {});
}

function inferDestinations(section) {
  const text = sectionText(section);
  return DESTINATION_NAMES.filter(name => text.includes(name));
}

function placeInDestination(section) {
  if (!section || typeof section !== 'object') return false;
  if (section.type === 'hotel') return true;
  if (section.type === 'timeline') return true;
  if (section.type === 'car' && inferDestinations(section).length) return true;
  return false;
}

function destinationKey(names) {
  if (names.includes('泸沽湖')) return '泸沽湖';
  if (names.includes('丽江') || names.includes('玉龙雪山')) return '丽江';
  return names[0] || '';
}

function childKind(type) {
  if (type === 'hotel') return 'lodging';
  if (type === 'car' || type === 'flight') return 'transport';
  if (type === 'timeline') return 'itinerary';
  return type || 'note';
}

function childTitle(section) {
  if (section.kind === 'arrival') return '抵达方式';
  if (section.kind === 'lodging' || section.type === 'hotel') return '住宿';
  if (section.kind === 'transport' || section.type === 'car') return '出行';
  if (section.kind === 'itinerary' || section.type === 'timeline') return '行程具体安排';
  return section.title || '补充信息';
}

function arrivalFromFlight(section) {
  if (!section || section.type !== 'flight') return null;
  const toNames = inferDestinations(section.to || {});
  const key = destinationKey(toNames);
  if (!key) return null;
  const from = section.from || {};
  const to = section.to || {};
  const date = [section.date, section.weekday].filter(Boolean).join(' ');
  const time = [from.time, to.time].filter(Boolean).join(' → ');
  const flight = section.flightNo ? ` · ${section.flightNo}` : '';
  return {
    key,
    text: `乘飞机抵达：${from.name || '出发地'} → ${to.name || key}${date ? `（${date}${flight}${time ? ` · ${time}` : ''}）` : flight ? `（${section.flightNo}）` : ''}`
  };
}

function arrivalFromTimelineItem(item, key) {
  const text = sectionText(item);
  if (key === '泸沽湖' && /前往泸沽湖|到泸沽湖|抵达泸沽湖/.test(text)) {
    const duration = text.match(/(?:车程|路程)[^，。；]*约\s*\d+\s*(?:小时|h)/i);
    return `自驾抵达：从丽江方向开车前往泸沽湖${duration ? `，${duration[0]}` : ''}。`;
  }
  if (key === '丽江' && /返回丽江|回丽江/.test(text)) return '自驾抵达：从泸沽湖返回丽江。';
  if (key === '返程') return '从丽江机场出发，返回上海浦东。';
  return '';
}

function upsertArrival(group, text, replace = false) {
  if (!text) return;
  if (!Array.isArray(group.children)) group.children = [];
  let child = group.children.find(section => section && section.kind === 'arrival');
  if (!child) {
    child = { type: 'note', kind: 'arrival', title: '抵达方式', text };
    group.children.unshift(child);
    return;
  }
  child.type = child.type || 'note';
  child.title = '抵达方式';
  if (replace || !child.text || child.text === '抵达方式待补充。') child.text = text;
}

function ensureArrival(group) {
  if (!Array.isArray(group.children)) group.children = [];
  if (!group.children.some(section => section && section.kind === 'arrival')) {
    group.children.unshift({ type: 'note', kind: 'arrival', title: '抵达方式', text: '抵达方式待补充。' });
  }
}

function sortDestinationChildren(group) {
  const order = { arrival: 0, lodging: 1, transport: 2, itinerary: 3 };
  group.children.sort((a, b) => (order[a.kind] ?? 9) - (order[b.kind] ?? 9));
}

function itineraryChild(group) {
  if (!Array.isArray(group.children)) group.children = [];
  let child = group.children.find(section => section && (section.kind === 'itinerary' || section.type === 'timeline'));
  if (!child) {
    child = { type: 'timeline', kind: 'itinerary', title: '行程具体安排', items: [] };
    group.children.push(child);
  }
  if (!Array.isArray(child.items)) child.items = [];
  child.kind = child.kind || 'itinerary';
  child.title = childTitle(child);
  return child;
}

function lodgingFromTimelineItem(item, key) {
  const text = sectionText(item);
  if (key === '泸沽湖' && text.includes('月遥全湖景')) {
    return {
      type: 'hotel',
      kind: 'lodging',
      title: '住宿',
      name: '泸沽湖前湖·月遥全湖景度假酒店（普洛码头店）',
      stars: '高级湖景露台大床房',
      tags: ['湖景露台', '普洛码头店', '有充电桩'],
      price: 542,
      priceUnit: '/ 晚',
      totalNote: '2晚人均 ≈ ¥542',
      tip: { icon: '🔌', text: '酒店配有充电桩，适合自驾电车补能。' },
      image: ''
    };
  }
  if (key === '丽江' && text.includes('丽江古镇') && /入住|住宿/.test(text)) {
    return { type: 'note', kind: 'lodging', title: '住宿', text: '丽江古镇附近住宿，方便傍晚逛古镇并休息。' };
  }
  return null;
}

function upsertLodging(group, lodging) {
  if (!lodging) return;
  if (!Array.isArray(group.children)) group.children = [];
  const exists = group.children.some(section => section && section.kind === 'lodging');
  if (!exists) group.children.push(lodging);
}

function timelineItemKey(item, fallback) {
  const text = sectionText(item);
  if (/返程|飞回上海|返回上海|上海浦东/.test(text)) return '返程';
  return destinationKey(inferDestinations(item)) || fallback || '';
}

function splitReturnItem(item) {
  const text = sectionText(item);
  if (!/返程|飞回上海|返回上海|上海浦东/.test(text) || !/还车|机场/.test(text)) return null;
  const chips = Array.isArray(item.chips) ? item.chips : [];
  return {
    lijiang: {
      ...item,
      heading: '丽江机场还车',
      desc: '前往丽江机场办理还车。',
      chips: chips.filter(chip => String(chip.text || '').includes('还车') || chip.kind === 'car')
    },
    returns: {
      ...item,
      heading: '飞回上海浦东',
      desc: '乘飞机返回上海浦东，结束云南之旅。',
      chips: chips.filter(chip => String(chip.text || '').includes('上海') || String(chip.text || '').includes('✈'))
    }
  };
}

export function normalizeSections(sections) {
  if (!Array.isArray(sections)) return [];

  const result = [];
  let lastGroup = null;
  const defaultArrivals = new Map();

  function addArrival(key, text) {
    if (key && text && !defaultArrivals.has(key)) defaultArrivals.set(key, text);
  }

  function groupKey(group) {
    return group && (group.destination || group.title);
  }

  function createGroup(key) {
    const group = { type: 'destination', title: key, destination: key, children: [] };
    result.push(group);
    lastGroup = group;
    upsertArrival(group, defaultArrivals.get(key));
    return group;
  }

  function hasItineraryItems(group) {
    return !!(group && Array.isArray(group.children) && group.children.some(child => (
      child && (child.kind === 'itinerary' || child.type === 'timeline') && Array.isArray(child.items) && child.items.length
    )));
  }

  function reusableEmptyStage(key) {
    for (let index = result.length - 1; index >= 0; index--) {
      const section = result[index];
      if (section && section.type === 'destination' && groupKey(section) === key && !hasItineraryItems(section)) return section;
    }
    return null;
  }

  function getStageGroup(key) {
    if (lastGroup && groupKey(lastGroup) === key) {
      if (!Array.isArray(lastGroup.children)) lastGroup.children = [];
      return lastGroup;
    }
    const reusable = reusableEmptyStage(key);
    if (reusable) {
      lastGroup = reusable;
      if (!Array.isArray(reusable.children)) reusable.children = [];
      return reusable;
    }
    return createGroup(key);
  }

  sections.forEach(section => {
    if (!section || typeof section !== 'object') return;
    if (section.type === 'destination') {
      result.push(section);
      lastGroup = section;
      return;
    }

    const arrival = arrivalFromFlight(section);
    if (arrival) addArrival(arrival.key, arrival.text);

    const names = inferDestinations(section);
    const key = destinationKey(names);
    if (!key || !placeInDestination(section)) {
      result.push(section);
      return;
    }

    if (section.type === 'timeline' && Array.isArray(section.items)) {
      const fallback = key || groupKey(lastGroup);
      section.items.forEach(item => {
        const split = splitReturnItem(item);
        if (split) {
          const lijiangGroup = getStageGroup('丽江');
          upsertArrival(lijiangGroup, arrivalFromTimelineItem(split.lijiang, '丽江'), true);
          itineraryChild(lijiangGroup).items.push(split.lijiang);
          const returnGroup = getStageGroup('返程');
          upsertArrival(returnGroup, arrivalFromTimelineItem(split.returns, '返程'), true);
          itineraryChild(returnGroup).items.push(split.returns);
          return;
        }
        const itemKey = timelineItemKey(item, fallback);
        if (!itemKey) return;
        const group = getStageGroup(itemKey);
        upsertArrival(group, arrivalFromTimelineItem(item, itemKey), true);
        upsertLodging(group, lodgingFromTimelineItem(item, itemKey));
        itineraryChild(group).items.push(item);
      });
      return;
    }

    const { num, ...child } = section;
    child.kind = child.kind || childKind(child.type);
    child.title = childTitle(child);
    getStageGroup(key).children.push(child);
  });

  result.forEach(section => {
    if (section && section.type === 'destination' && Array.isArray(section.children)) {
      const key = groupKey(section);
      upsertArrival(section, defaultArrivals.get(key));
      ensureArrival(section);
      const hasItinerary = section.children.some(child => child && (child.kind === 'itinerary' || child.type === 'timeline'));
      if (!hasItinerary) section.children.push({ type: 'timeline', kind: 'itinerary', title: '行程具体安排', items: [] });
      sortDestinationChildren(section);
    }
  });
  result.forEach((section, index) => { section.num = index + 1; });
  return result;
}

export function normalizeTripStructure(trip) {
  if (!trip || typeof trip !== 'object') return trip;
  const next = { ...trip, sections: normalizeSections(trip.sections || []) };
  next.photos = Array.isArray(next.photos) ? next.photos : [];
  return next;
}

export const CHAT_STRUCTURE_GUARD = `结构定位规则：当前行程 sections 使用 destination 分组，并且必须保持时间顺序。同一地点如果非连续出现，可以有多个 destination，例如「丽江 → 泸沽湖 → 丽江 → 返程」必须拆成四段，不要把两段丽江合并后打乱 7/21、7/22、7/24 的顺序。修改行程前必须先判断用户提到的目的地、日期和主题；新增当地游玩安排时，必须加入匹配时间阶段的 destination.children 中 kind="itinerary" 或标题含「行程」的 timeline.items。若不存在该 timeline 就在匹配 destination.children 下新建 {type:"timeline", kind:"itinerary", title:"行程具体安排", items:[]}。「丽江」和「泸沽湖」是两个不同 destination：泸沽湖环湖/住宿/前往泸沽湖相关日程放泸沽湖，玉龙雪山/丽江古镇放第一段丽江，束河/丽江机场还车放第二段丽江，飞回上海放「返程」。每个 destination 应有 kind="arrival" 且 title="抵达方式" 的 note；租车取车放第一段丽江，还车放第二段丽江。例如「西双版纳帮我添加一个7/20下午去植物园的行程」必须加入西双版纳 destination 的行程具体安排，不能加入丽江或泸沽湖。返回完整 updatedTrip，并保留未改字段。`;