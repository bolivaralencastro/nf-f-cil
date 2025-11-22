import { Injectable, inject } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable, of } from 'rxjs';
import { map, catchError } from 'rxjs/operators';

interface NominatimResponse {
  lat: string;
  lon: string;
  display_name: string;
}

export interface Coordinates {
    lat: number;
    lon: number;
}

@Injectable({
  providedIn: 'root'
})
export class GeocodingService {
  private readonly http = inject(HttpClient);
  private cache = new Map<string, Coordinates>();
  private readonly NOMINATIM_URL = 'https://nominatim.openstreetmap.org/search';

  getCoordinates(address: string): Observable<Coordinates | null> {
    const cachedCoords = this.cache.get(address);
    if (cachedCoords) {
      return of(cachedCoords);
    }

    const params = {
      q: address,
      format: 'json',
      limit: '1'
    };

    return this.http.get<NominatimResponse[]>(this.NOMINATIM_URL, { params }).pipe(
      map(response => {
        if (response && response.length > 0) {
          const coords: Coordinates = {
            lat: parseFloat(response[0].lat),
            lon: parseFloat(response[0].lon)
          };
          this.cache.set(address, coords);
          return coords;
        }
        return null;
      }),
      catchError(error => {
        console.error(`Geocoding error for address "${address}":`, error);
        return of(null);
      })
    );
  }
}