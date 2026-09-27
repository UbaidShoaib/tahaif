/**
 * Starter messages for the greeting card, so a buyer abroad can send warm words
 * in the language the family speaks. Buyers edit them freely before saving.
 *
 * Urdu wording needs a native-speaker review before launch (docs/questions.md Q22).
 */

export type CardLanguage = "en" | "ur" | "roman";

export const CARD_LANGUAGES: { id: CardLanguage; label: string }[] = [
  { id: "en", label: "English" },
  { id: "ur", label: "اردو" },
  { id: "roman", label: "Roman Urdu" },
];

export type GreetingTemplate = { occasion: string; text: Record<CardLanguage, string> };

export const GREETING_TEMPLATES: GreetingTemplate[] = [
  {
    occasion: "Birthday",
    text: {
      en: "Happy birthday! Wish I could be there to celebrate with you. Sending all my love.",
      ur: "سالگرہ مبارک! کاش میں آپ کے ساتھ ہوتا۔ ڈھیروں محبت اور دعائیں۔",
      roman: "Salgirah mubarak! Kaash main aap ke saath hota. Dheron mohabbat aur duayein.",
    },
  },
  {
    occasion: "Eid",
    text: {
      en: "Eid Mubarak! Missing you all today. May this Eid bring joy and blessings to our home.",
      ur: "عید مبارک! آج آپ سب کی بہت یاد آ رہی ہے۔ اللہ یہ عید ہمارے گھر کے لیے خوشیاں اور برکتیں لائے۔",
      roman: "Eid Mubarak! Aaj aap sab ki bohat yaad aa rahi hai. Allah yeh Eid hamare ghar ke liye khushiyan aur barkatein laye.",
    },
  },
  {
    occasion: "For Ammi",
    text: {
      en: "Ammi, you are my whole world. Thank you for everything. I love you.",
      ur: "امی، آپ میری پوری دنیا ہیں۔ ہر چیز کے لیے شکریہ۔ آپ سے بہت پیار ہے۔",
      roman: "Ammi, aap meri poori duniya hain. Har cheez ke liye shukriya. Aap se bohat pyaar hai.",
    },
  },
  {
    occasion: "Anniversary",
    text: {
      en: "Happy anniversary! Wishing you many more years of love and laughter together.",
      ur: "شادی کی سالگرہ مبارک! اللہ آپ دونوں کو ہمیشہ خوش رکھے۔",
      roman: "Shaadi ki salgirah mubarak! Allah aap dono ko hamesha khush rakhe.",
    },
  },
  {
    occasion: "Get well",
    text: {
      en: "Get well soon! Thinking of you and praying for your quick recovery.",
      ur: "جلد صحت یاب ہو جائیں! آپ کے لیے دعا کر رہا ہوں۔",
      roman: "Jald sehatyab ho jayein! Aap ke liye dua kar raha hoon.",
    },
  },
  {
    occasion: "Thinking of you",
    text: {
      en: "Just because. Miles away, but you're always in my heart.",
      ur: "بس یونہی۔ میلوں دور ہوں، مگر آپ ہمیشہ میرے دل میں ہیں۔",
      roman: "Bas yunhi. Meelon door hoon, magar aap hamesha mere dil mein hain.",
    },
  },
];
