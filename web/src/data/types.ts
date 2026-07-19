/** Shape returned by GDELT's DOC 2.0 API (mode=artlist, format=json) — each entry in `articles`. */
export interface RawArticle {
  url: string;
  url_mobile: string;
  title: string;
  seendate: string;
  socialimage: string;
  domain: string;
  language: string;
  sourcecountry: string;
}

export interface GeoPoint {
  lat: number;
  lng: number;
  iso2: string;
  flag: string;
}

/** Normalized, render-ready news item. `geo` is undefined when sourcecountry is empty/unresolvable. */
export interface NewsItem {
  id: string;
  title: string;
  url: string;
  domain: string;
  language: string;
  sourceCountry: string;
  seenDate: Date | null;
  socialImage: string | null;
  geo: GeoPoint | null;
}
