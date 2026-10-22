import { seededRng } from './generate';

/**
 * Daily-note text for the demo spaces. Everything here is made up. The
 * pools are large and are drawn without replacement (a shuffled bag that
 * refills only when empty), so a line comes back rarely and a few years of
 * notes read like different days. Season pools follow the northern calendar.
 */

type Rng = () => number;
type Season = 'winter' | 'spring' | 'summer' | 'autumn';

export function seasonOf(date: string): Season {
  const month = Number(date.slice(5, 7));
  if (month === 12 || month <= 2) return 'winter';
  if (month <= 5) return 'spring';
  if (month <= 8) return 'summer';
  return 'autumn';
}

function bagOf<T>(rng: Rng, items: readonly T[]): () => T {
  let queue: T[] = [];
  return () => {
    if (queue.length === 0) {
      queue = [...items];
      for (let i = queue.length - 1; i > 0; i -= 1) {
        const j = Math.floor(rng() * (i + 1));
        [queue[i], queue[j]] = [queue[j]!, queue[i]!];
      }
    }
    return queue.pop()!;
  };
}

interface Pools {
  any: readonly string[];
  seasonal: Record<Season, readonly string[]>;
  tasks: readonly string[];
  paragraphs: readonly string[];
  morning: readonly string[];
  evening: readonly string[];
  quotes: readonly string[];
  /** Names in the text that become [[links]] now and then, as real notes have. */
  links: Record<string, string>;
}

/** What `body` needs to know about the day it writes. */
export interface DayContext {
  date: string;
  /** A day the demo relies on (a lookback, an anniversary): give it a fuller entry. */
  featured: boolean;
}

function composer(pools: Pools, seed: number): (day: DayContext, rng: Rng) => string {
  const bagRng = seededRng(seed);
  const any = bagOf(bagRng, pools.any);
  const seasonal = {
    winter: bagOf(bagRng, pools.seasonal.winter),
    spring: bagOf(bagRng, pools.seasonal.spring),
    summer: bagOf(bagRng, pools.seasonal.summer),
    autumn: bagOf(bagRng, pools.seasonal.autumn),
  };
  const tasks = bagOf(bagRng, pools.tasks);
  const paragraphs = bagOf(bagRng, pools.paragraphs);
  const morning = bagOf(bagRng, pools.morning);
  const evening = bagOf(bagRng, pools.evening);
  const quotes = bagOf(bagRng, pools.quotes);

  return (day, rng) => {
    const season = seasonal[seasonOf(day.date)];
    const line = (): string => (rng() < 0.55 ? season() : any());
    const lines = (n: number): string[] => {
      const out: string[] = [];
      while (out.length < n) {
        const next = line();
        if (!out.includes(next)) out.push(next);
      }
      return out;
    };

    const roll = day.featured ? 0.95 : rng();
    let body: string;
    if (roll < 0.3) {
      body = lines(1 + Math.floor(rng() * 2)).map((l) => `- ${l}`).join('\n');
    } else if (roll < 0.52) {
      body = lines(3).map((l) => `- ${l}`).join('\n');
    } else if (roll < 0.66) {
      const count = 3 + Math.floor(rng() * 2);
      const items: string[] = [];
      while (items.length < count) {
        const task = tasks();
        if (!items.includes(task)) items.push(task);
      }
      body = items.map((t) => `- [${rng() < 0.55 ? 'x' : ' '}] ${t}`).join('\n');
    } else if (roll < 0.78) {
      body = `## Morning\n- ${morning()}\n\n## Evening\n- ${evening()}`;
    } else {
      body = paragraphs();
    }

    if (day.featured || rng() < 0.22) body += `\n\n> ${quotes()}`;

    for (const [name, link] of Object.entries(pools.links)) {
      if (rng() < 0.5) body = body.replace(name, `[[${link}]]`);
    }
    return body;
  };
}

/* ------------------------------------------------------------------ */
/* The Fernweh Field Office: a hut, a survey and a lot of letters.     */
/* ------------------------------------------------------------------ */

const FIELD_OFFICE: Pools = {
  any: [
    'Ansel thinks the pass will clear early this year.',
    'Letter from Cordelia, twelve pages, mostly about the lighthouse.',
    'Mended the tent seam with the waxed thread.',
    'Read two chapters of the glacier survey and made notes in the margins.',
    'Sketched the cirque from the eastern moraine in charcoal.',
    'Counted strides on the lake loop: 4,180.',
    'No plans today. Read by the stove.',
    'Re-read last spring’s journal. Most of what worried me then never happened.',
    'The barometer fell all afternoon. Brought the gear in.',
    'Long letter to Wren about the summer schedule.',
    'Walked the ridge line before breakfast. The valley fog was gone by nine.',
    'Oiled the door hinges. The squeak was loud enough to wake Ansel.',
    'Spent the morning on the survey ledger. The east column still does not add up.',
    'Found the missing pencil in the left boot.',
    'Wren sent comments on chapter two. Most of them are fair.',
    'Cold porridge for breakfast because I forgot the pot.',
    'Made soup from the last of the onions. It needed salt.',
    'Checked the radio batteries. Two are weak, so I am ordering six more.',
    'Called the survey office. They promised a reply by Friday.',
    'Spent an hour looking for the compass. It was in my coat pocket.',
    'Washed the mugs and swept the floor. The office looks like a place people work.',
    'Dentist appointment moved to the 14th.',
    'Dad rang about the roof. The tiles can wait until spring.',
    'Slept badly. Too much tea after four.',
    'Gave the stove a proper clean. Soot everywhere, including the ceiling.',
    'Filed the week’s weather readings. Mostly cloud.',
    'Ansel lent me his good boots for the day. They fit better than mine.',
    'The kettle died. Bought a new one in town.',
    'Planned the week on one sheet of paper. It lasted until Tuesday.',
    'Walked down to the post box with three letters. One was a reply I had put off for a month.',
    'Listened to the radio forecast twice and wrote both versions down. They disagreed.',
    'Made a list of everything I want to learn this year. Eleven items, which is too many.',
    'Cleaned the lens on the survey scope.',
    'Tidied the map drawers and found a 1998 sheet of the north tarn.',
    'Rice and lentils again. Added chilli flakes to make it a different dinner.',
    'Tried a new route to the water source. It saves ten minutes if the stream is low.',
    'Back is sore from carrying the long ladder.',
    'Borrowed a book on lichens from the village library. The pictures are good.',
    'Spent the evening on the crossword. Finished all but two clues.',
    'Rewired the lamp. It works and nothing smells of smoke.',
    'The goat next door ate my glove.',
    'Planned lunch around the one fresh loaf.',
    'Wrote the thank-you note to the supplier at last.',
    'The office clock runs four minutes slow. Left it that way.',
    'Moved the desk closer to the window. Better light after two.',
    'Watched a hawk work the slope for an hour.',
    'Phone battery at 9% all day. Lived with it.',
    'Backed up the survey photos onto the second drive.',
    'Ordered a new pair of gaiters. The old ones have given up at the seams.',
    'A quiet day. Answered letters until the light went.',
    'Wrote “check the stove gasket” on three different lists.',
    'Cordelia asked for the tide tables again. Found them under the kettle.',
    'Ansel and I argued about knots for an hour. He is right about the bowline.',
    'Reread the first page of the glacier report and cut half of it.',
    'Bought stamps for the whole month.',
    'The lamp oil is lower than I thought. Rationing until the order arrives.',
  ],
  seasonal: {
    winter: [
      'Snow overnight, about a hand deep. Shovelled the hut steps twice.',
      'The water jug froze solid by the door. Moved it next to the stove.',
      'Minus eleven at dawn. The thermometer on the north wall agrees with the radio.',
      'Dug out the path to the woodshed. Forty minutes for twelve metres.',
      'Inventory day: tins, fuel, candles. Everything counted twice.',
      'Waxed the skis. The left one has a new scratch.',
      'Ice on the inside of the window. Drew a small map in it, then wiped it away.',
      'Sledge runner repaired with a strip of brass and too many screws.',
      'Stayed in all day. Wrote the first half of the quarterly report.',
      'The snow report came in: pass closed until at least March.',
      'Chopped kindling until my hands warmed up.',
      'Caught Wren’s cold. Hot lemon and honey all afternoon.',
      'Short day. Light gone by half past four.',
      'Read the whole of the old expedition diary by lamplight.',
      'Clear and bitter. The stars over the ridge were sharp enough to count.',
      'Drifts against the north wall reach the sill.',
      'Boiled snow for tea because the pump is frozen.',
      'Sewed a patch on my glove liner. It holds.',
      'Skied to the lower hut and back, two hours. Legs feel it.',
      'Wrote the new year’s list and folded it into the logbook.',
      'Wrapped the parcel for Cordelia. The post goes down on Friday.',
      'Thaw in the afternoon. Water dripping off the eaves all evening.',
      'Updated the fuel log. We are burning more than last winter.',
      'The generator needed three pulls and a prayer.',
      'Fresh bread from the village arrived with the sledge. Ate half before unpacking.',
      'Blizzard from noon. Tied a rope from the door to the woodshed.',
      'Sat by the stove and sorted old photographs.',
      'Counted the days to spring: ninety-one, give or take.',
    ],
    spring: [
      'First meltwater in the gully. You can hear it from the door.',
      'Snowdrops under the south wall. Ansel says they are early.',
      'Started the seedlings on the windowsill: beans and two kinds of kale.',
      'The pass is open for walkers. The sledge will have to wait.',
      'Mud everywhere. Left my boots in the porch and went in socks.',
      'Repaired the fence on the north terrace where the snow pulled it down.',
      'Cleared the gutters of a winter’s worth of needles.',
      'First lark of the year over the lower meadow.',
      'Spring order drafted: fuel, tins, a new tarp, rope.',
      'Aired the sleeping bags on the line all afternoon.',
      'Dug the first bed. The soil is heavy but it will do.',
      'Rain from the west. The valley smells of wet stone.',
      'Mended the roof flashing before the next storm.',
      'Visitors from the survey office. They stayed for tea and left with the wrong map.',
      'Painted the door frame green. The first coat is thin.',
      'Trail check up to the second marker. Two trees are down across the path.',
      'Fog in the morning, bright by eleven.',
      'The stream is loud tonight. Left the window open to hear it.',
      'Moved the winter gear into the loft.',
      'Swept out the hut. Found a mouse nest in the boot box and moved it to the shed.',
      'Packed for the glacier camp. Checked the crampon straps twice.',
      'Started the new notebook. First page: a list of repairs.',
      'Light until eight. Ate dinner outside.',
      'The south slope is bare. The north slope will hold its snow for weeks.',
      'Planted peas. Something will probably eat them.',
      'Counted the tin shelves: down to nineteen. Order due.',
      'Found a letter I never sent while cleaning the logbook shelves.',
      'Hail for ten minutes, then sun. The terrace looks washed.',
      'Helped Ansel carry the new stove pipe up from the road.',
    ],
    summer: [
      'Up at five for the ridge walk. The whole valley was lit from the east.',
      'Warm enough to eat outside until nine.',
      'Glacier camp set up on the moraine. Tents pitched into the wind.',
      'Swam in the tarn. Ten seconds counts.',
      'Thunderstorm over the western peaks. Counted the gap between flash and sound: nine seconds.',
      'Survey day at the lower cirque. Eleven readings before the clouds came in.',
      'Picked wild bilberries and made a mess of my shirt.',
      'The terrace beans are climbing the poles already.',
      'Dry week. The stream is low and the water source needs a longer hose.',
      'Dust on the road. Every vehicle announces itself a mile out.',
      'Sunburn on the back of my neck. Should have worn the hat.',
      'Visitors on the trail all weekend. Answered the same question about the weather six times.',
      'Cut the grass around the hut with the old scythe. My arms ache.',
      'Midsummer evening on the moraine, light until eleven.',
      'Dried herbs hanging from the beam: mint, thyme, a little sage.',
      'Wrote letters in the shade all afternoon.',
      'Flies everywhere. Hung the sticky strip over the table.',
      'Fixed the cracked water barrel with resin. Fingers crossed.',
      'Long day on the glacier. Back at camp with sore knees and a good dataset.',
      'The meadow is full of harebells.',
      'Evening swim, then soup.',
      'Heat haze over the lower valley. Visibility poor past the second ridge.',
      'Ran out of coffee on day three. Ansel shared his last spoonful.',
      'Watched a marmot argue with a rock.',
      'Left at dawn and was back by noon before the storms.',
      'Rebuilt the cairn at the saddle. It lasted a day before a walker added a stone.',
      'Tomatoes ripening on the south sill.',
      'Ate lunch on the pass and watched the clouds below us.',
    ],
    autumn: [
      'First frost on the terrace. Covered the late beans with a sheet.',
      'The larches are turning. The whole east slope looks lit from inside.',
      'Harvest day: potatoes, carrots, the last of the kale.',
      'Stored apples in the loft between sheets of newspaper.',
      'Quarter past six and already dark. The days are shortening.',
      'Wind from the north all day. The chimney drew well.',
      'Rain for the fourth day running. Everything smells of wet wool.',
      'Started the winter inventory early. Fuel is the worry.',
      'Stacked the last of the firewood. Three cords, give or take.',
      'Geese going south over the lake, long skeins at dusk.',
      'The ground is stiff in the mornings now.',
      'Brought the seed tins in from the shed. Labelled each one with the year this time.',
      'Fog in the valley until noon. The hut was above it, with sun on the stove pipe.',
      'Final survey day of the season. Packed the instruments in their cases.',
      'Made plum jam from the village gift. Eleven jars.',
      'Ansel left for the lowlands. The hut is quiet.',
      'Fixed the loose shingles before the weather turns.',
      'First snow on the high peaks. A thin stripe of icing.',
      'Put the summer tent away, dry and folded.',
      'Swapped the lamp wicks and cleaned the glass.',
      'Dug the last of the carrots by lantern light.',
      'Mushrooms along the lower path. Picked only the ones I know.',
      'Caulked the north windows against drafts.',
      'The clocks changed. Spent the morning confused.',
      'Wrote the season report. Eleven pages and one map.',
      'Mist on the lake at dawn, like a lid.',
      'Cleared the stream intake of fallen leaves.',
    ],
  },
  tasks: [
    'Send the tide tables to Cordelia',
    'Order stove fuel',
    'Reply to the survey office',
    'Re-wax the skis',
    'Check the radio batteries',
    'Draft the quarterly report',
    'Sort the seed tins',
    'Mend the tent seam',
    'Count the tins',
    'Back up the survey photos',
    'Call the dentist',
    'Write to Wren',
    'Clean the stove flue',
    'Fix the water barrel',
    'Return the lichen book',
    'Buy stamps',
    'Update the weather log',
    'Pack the glacier kit',
    'Oil the door hinges',
    'Renew the hut permit',
    'Buy a new kettle',
    'Confirm the three place names',
    'Replace the stove gasket',
    'Label the sample bags',
    'Probe the snow bridge again',
    'Take the old batteries to the village',
    'Fill the lamps',
    'Send Dad the photos',
  ],
  paragraphs: [
    'Spent most of the day on the survey ledger. The east column still disagrees with the field book by eleven metres, and I suspect the second marker. Will walk up on Thursday with the tape.',
    'Ansel came by after lunch with news from the village. The bridge repair is finished, the post will run on its old days again, and the baker has a new apprentice who burns every third loaf. We ate one of the burnt ones anyway.',
    'The wind came up at four and the hut talked all evening. Every board has its own note. I wrote by the lamp and did not mind.',
    'Cordelia’s letter arrived. She is thinking of moving the lighthouse survey to autumn, which suits me, since the tide tables for September are the cleanest.',
    'Woke early and walked to the saddle before breakfast. A thin line of cloud sat on the far ridge. I stood there long enough to get cold, then went down and made coffee.',
    'Rearranged the map drawers by region instead of by year. It took the whole afternoon. Finding the 1998 sheet of the north tarn took four seconds afterward.',
    'A long call with Wren about the report. She wants shorter chapters and more figures. I think she is right about the figures.',
    'Rain, so a desk day. Wrote up the glacier readings, filed the photos, and answered four letters. The stove ran well and the tea was hot.',
    'Got the sledge down to the road with Ansel. The runner held. We stopped at the bakery on the way back and bought too much bread.',
    'I keep thinking about the crevasse near the second marker. The snow bridge looked fine and was not. Next season: probe every ten steps, whatever the weather.',
    'The new stove draws at last. It took a longer pipe and an hour with a spirit level, and now the room is warm by seven.',
    'Ran the tide table check against Cordelia’s numbers. We differ by six minutes at low water, and I do not know whose clock is slower.',
    'Quiet evening. I read the first third of a novel about a lighthouse keeper and fell asleep with the lamp on.',
    'The survey office replied. They will send a new map sheet of the north tarn in spring and have asked me to confirm the spelling of three place names.',
    'Cooked for four tonight: Ansel, two walkers from the lower hut, and me. Lentil stew, a loaf from the village, and apples. The walkers left a tin of tea behind as thanks.',
    'A day of small repairs: the door latch, the lamp wick, a hole in the glove. By evening the list was shorter and my hands were black.',
    'Stood on the moraine at dusk and watched the last light leave the glacier. It goes from the bottom up, which I had not noticed before.',
    'Counted the stores for the winter plan. If the post runs twice a week we have plenty. If the pass closes early we will be eating rice from January.',
    'Packed the instruments in felt and put them in the dry cupboard. The scope came through the season without a scratch.',
    'Tried baking bread in the hut oven for the first time. The crust was fine and the middle was raw. Second attempt tomorrow.',
    'The wind dropped overnight and the valley filled with fog. I walked down through it with a torch and came out into sunshine at the bridge.',
    'Letter to Cordelia, four pages: the tide tables, the new stove, the marmot, and a question about her sister’s wedding.',
    'Spent the evening going through the old expedition diary. The handwriting is awful but the weather notes are precise, and some of them match my own readings from twenty years later.',
  ],
  morning: [
    'Ridge walk at 6:15, cold and clear.',
    'Porridge and the radio forecast.',
    'Checked the rain gauge: 12 mm overnight.',
    'Stove lit by six.',
    'Read last year’s weather log at breakfast.',
    'Fetched water from the spring. Ice on the rim.',
    'Packed lunch for the survey run.',
    'Wrote letters until nine.',
    'Swept the porch.',
    'Called the village shop about the order.',
    'Calibrated the scope.',
    'Took the lower path to the post box.',
  ],
  evening: [
    'Soup and bread, then the crossword.',
    'Cleaned the lamp glass.',
    'Logged the day’s readings.',
    'Read until the candle guttered.',
    'Wrote up the survey notes.',
    'Planned tomorrow on a single card.',
    'Sat on the porch until the stars came out.',
    'Mended a sock.',
    'Letter to Wren, half written.',
    'Early to bed.',
    'Dishes, then a long look at the sky.',
    'Tea with Ansel and an argument about knots.',
  ],
  quotes: [
    'Ansel: "Leave the hut by six or not at all."',
    'Cordelia: "Send the tide tables when you can."',
    'Note to self: check the stove fuel before every trip.',
    'Wren: "Pack the heavy things close to your back."',
    'Ansel: "If it looks like a bridge, probe it twice."',
    'Cordelia: "Your handwriting has improved, or you are writing slower."',
    'Wren: "Shorter chapters, more figures."',
    'Note to self: write the date on every sample bag.',
    'Ansel: "The pass opens when it opens."',
    'Cordelia: "Come in September. The tides are kinder."',
    'Wren: "Put the hard part first."',
    'Note to self: replace the stove gasket before the first frost.',
    'Dad: "A roof is a promise you keep every year."',
  ],
  links: {
    Cordelia: 'Cordelia Marsh',
    Ansel: 'Ansel Quist',
    Wren: 'Wren Okafor',
  },
};

/** Text for a day in the field office space. */
export function fieldOfficeDay(seed: number): (day: DayContext, rng: Rng) => string {
  return composer(FIELD_OFFICE, seed);
}

/* ------------------------------------------------------------------ */
/* Kitchen Table Notes: ordinary days at home.                         */
/* ------------------------------------------------------------------ */

const KITCHEN: Pools = {
  any: [
    'Tried the new bakery on Alder Street. The rye is the real thing.',
    'Rain all day. Finished the puzzle with the missing corner piece.',
    'Called home. Dad is naming the chickens after composers now.',
    'Fixed the wobbling shelf. It only took eleven months of noticing it.',
    'Started re-reading the sea novel. It is better the second time.',
    'Long walk, no phone. The heron was back at the weir.',
    'Made a big pot of chickpea curry. Lunch for the week.',
    'Dentist at ten. No cavities, and a lecture about flossing.',
    'Library books due Thursday. Finished one, started the other.',
    'The bus was late again. Walked the last stretch.',
    'Replaced the bathroom light bulb that had been out since March.',
    'Spent twenty minutes looking for my glasses. They were on my head.',
    'Sunday dinner at Mara’s. She made the plum cake.',
    'Washed the windows. It rained an hour later.',
    'New tea from the shop on the corner. Smoky, like a campfire.',
    'Sorted the drawer of cables. Threw out nine, kept one.',
    'Phone call with Priya about the garden. She wants to share her tomato seedlings.',
    'Fixed the bike chain with a video and a lot of grease.',
    'Watched the neighbour’s cat sunbathe on the shed roof for most of the afternoon.',
    'Bought a plant that the label says is impossible to kill. We will see.',
    'Finished the knitting. The sleeve is a bit too long.',
    'Dinner: leftover soup and toast. No complaints.',
    'Paid the electricity bill and filed the receipt.',
    'Went through the recipe box and threw out the ones I will never make.',
    'Played the old records all afternoon. The one with the crackle at the start is still the best.',
    'Kept reading when I should have slept.',
    'Posted Mara’s birthday card, three days late.',
    'The radio said rain by noon. It was dry until six.',
    'Slow morning. Coffee on the step and nobody else awake.',
    'Cleaned out the fridge. Found a jar of something I made in spring.',
    'Went to the market for peaches. They were not ready yet.',
    'Hemmed the curtains. The left one is a centimetre shorter than the right.',
    'Taught myself to poach an egg. Took six tries.',
    'The washing machine made a new noise. Pretending it is fine.',
    'Walked to the allotment and watered everything twice.',
    'Posted the parcel to Priya. The queue was only four people.',
    'Wrote the shopping list on the back of an envelope and left it on the table.',
    'Spent the evening on a jigsaw of a lighthouse. Missing three pieces by the end.',
    'Chatted with the old man at the bakery about sourdough. He says patience is the whole trick.',
    'Cut my own hair. Mara says it is fine.',
    'Drank too much coffee and cleaned the oven.',
    'Spent the afternoon repotting the herbs.',
    'Called the plumber. He can come Tuesday.',
    'Dad sent a photo of the chickens. One of them looks guilty.',
    'Took the long way home past the river.',
    'Dropped off a bag of clothes at the charity shop.',
    'Tried a new pasta recipe. It needs more garlic.',
    'It rained on the washing. Hung it up again.',
    'Rearranged the bookshelf by colour for about an hour, then gave up and did it by author.',
    'Went to bed at nine like a person with a plan.',
    'Stopped at the bakery again. The rye sold out before ten.',
    'The tap is dripping. Wrote “washer” on the list.',
  ],
  seasonal: {
    winter: [
      'Frost on the windows. Scraped the car before work.',
      'Soup weather. Made leek and potato.',
      'Dark by half past four. Lit the lamps early.',
      'Wrapped presents at the kitchen table.',
      'Snow for an hour, gone by lunch.',
      'Wore two jumpers indoors.',
      'Hot water bottle night.',
      'Bought clementines by the bag.',
    ],
    spring: [
      'First warm day. Sat on the step without a coat.',
      'Daffodils out along the canal.',
      'Started seeds in egg boxes on the windowsill.',
      'Hung the washing outside for the first time this year.',
      'Heard the first blackbird at dawn.',
      'Swapped the winter duvet for the light one.',
      'Rain, and then a rainbow over the allotment.',
      'Cleaned the windows after the winter.',
    ],
    summer: [
      'Too hot to cook. Cheese, tomatoes and bread for dinner.',
      'Ate outside until the midges came.',
      'Picked the first strawberries. Seven, shared three ways.',
      'Windows open all night.',
      'Swam at the lido after work.',
      'Thunder in the evening, then everything smelled green.',
      'Made elderflower cordial.',
      'Watered the garden at dusk.',
    ],
    autumn: [
      'Blackberries along the lane. Came home with purple fingers.',
      'First fire of the season.',
      'Leaves all over the path. Swept them, and they came back.',
      'Made apple crumble from the neighbour’s tree.',
      'Dark mornings again. Hard to get up.',
      'Bought a new umbrella. It was sunny the rest of the week.',
      'Pumpkins at the market.',
      'Put the clocks back and gained an hour that I spent asleep.',
    ],
  },
  tasks: [
    'Post Priya’s parcel',
    'Call the plumber',
    'Renew the library books',
    'Buy bread flour',
    'Pay the water bill',
    'Water the herbs',
    'Return the ladder to Mr. Hale',
    'Book the dentist',
    'Wash the curtains',
    'Fix the tap washer',
    'Plan the week’s dinners',
    'Write to Dad',
    'Send Mara a birthday card',
    'Mend the bike tyre',
    'Sort the pantry',
    'Take the recycling out',
    'Buy light bulbs',
    'Unpack the last box',
    'Order the seeds',
  ],
  paragraphs: [
    'Tried the rye recipe the baker on Alder Street wrote on a card for me. The crumb came out dense and sour, which is right. Next time a longer rise and a hotter oven.',
    'Spent the morning on the allotment weeding between the onions. The soil came away in clumps, and by noon I had a bucket of weeds and a sunburned neck. Priya brought tea.',
    'Long call with Dad. The roof is fine, the chickens are fine, and the neighbours have complained about the rooster. He says he will rehome the rooster, but I do not believe him.',
    'A good reading day. Finished the sea novel and started a collection of short essays about walking. One of them was about the same weir where I see the heron.',
    'Rain from breakfast onwards, so I tidied the pantry and made a list of everything that had expired. The list is longer than I expected.',
    'Mara and I cooked together for the first time in months. She chopped, I stirred, and we argued about salt until the food was ready. It was good.',
    'Got the bike working again. The chain was the problem, plus a bent mudguard. I rode to the river and back and felt like a teenager.',
    'Went through old photographs. There is one of the kitchen table before we painted it, and I had forgotten it was ever that colour.',
  ],
  morning: [
    'Coffee on the step.',
    'Porridge with the last of the plums.',
    'Walked to the bakery before it opened.',
    'Watered the herbs on the sill.',
    'Called Dad before he went out to the chickens.',
  ],
  evening: [
    'Jigsaw and tea.',
    'Cooked a big pot of soup.',
    'Read until the lamp went off by itself.',
    'Washed up and listened to the radio.',
    'Sat on the step until the swifts went quiet.',
  ],
  quotes: [
    'Mara: "Taste it before you season it."',
    'Dad: "The chickens know when it is going to rain."',
    'Priya: "Plant it now and thank me in August."',
    'Note to self: buy bread flour before Saturday.',
  ],
  links: {},
};

/** Text for a day in the kitchen table space. */
export function kitchenDay(seed: number): (day: DayContext, rng: Rng) => string {
  return composer(KITCHEN, seed);
}
