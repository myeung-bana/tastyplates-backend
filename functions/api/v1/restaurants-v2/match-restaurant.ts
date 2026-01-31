import type { Request, Response } from 'express';
import { hasuraAdminQuery } from '../../../_lib/hasuraAdminClient';

function calculateDistanceKm(lat1: number, lon1: number, lat2: number, lon2: number): number {
  const R = 6371;
  const dLat = ((lat2 - lat1) * Math.PI) / 180;
  const dLon = ((lon2 - lon1) * Math.PI) / 180;
  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos((lat1 * Math.PI) / 180) *
      Math.cos((lat2 * Math.PI) / 180) *
      Math.sin(dLon / 2) *
      Math.sin(dLon / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return R * c;
}

const MATCH_RESTAURANT_BY_PLACE_ID = `
  query MatchRestaurantByPlaceId($placeId: String!) {
    restaurants(
      where: { address: { _contains: { place_id: $placeId } } }
      limit: 1
    ) {
      id
      uuid
      title
      slug
      status
      listing_street
      phone
      menu_url
      longitude
      latitude
      featured_image_url
      average_rating
      ratings_count
      address
    }
  }
`;

const MATCH_RESTAURANT_BY_NAME_ADDRESS = `
  query MatchRestaurantByNameAndAddress($name: String!, $address: String!) {
    restaurants(
      where: {
        _and: [
          { title: { _ilike: $name } }
          { listing_street: { _ilike: $address } }
        ]
      }
      limit: 5
    ) {
      id
      uuid
      title
      slug
      status
      listing_street
      phone
      menu_url
      longitude
      latitude
      featured_image_url
      average_rating
      ratings_count
      address
    }
  }
`;

export default async function matchRestaurant(req: Request, res: Response) {
  try {
    const { place_id, name, address, latitude, longitude } = (req.body ?? {}) as {
      place_id?: string;
      name?: string;
      address?: string;
      latitude?: number;
      longitude?: number;
    };

    // Priority 1: place_id
    if (place_id) {
      try {
        const result = await hasuraAdminQuery<{ restaurants: any[] }>(MATCH_RESTAURANT_BY_PLACE_ID, {
          placeId: place_id,
        });
        if (result.data?.restaurants?.length) {
          return res.status(200).json({
            match: true,
            restaurant: result.data.restaurants[0],
            matchType: 'place_id',
          });
        }
      } catch {
        // continue
      }
    }

    // Priority 2: name + address
    if (name && address) {
      try {
        const addressPart = address.split(',')[0]?.trim() ?? address.trim();
        const namePattern = `%${name}%`;
        const addressPattern = `%${addressPart}%`;

        const result = await hasuraAdminQuery<{ restaurants: any[] }>(MATCH_RESTAURANT_BY_NAME_ADDRESS, {
          name: namePattern,
          address: addressPattern,
        });

        if (result.data?.restaurants?.length) {
          return res.status(200).json({
            match: true,
            restaurant: result.data.restaurants[0],
            matchType: 'name_address',
          });
        }
      } catch {
        // continue
      }
    }

    // Priority 3: coordinates proximity
    if (typeof latitude === 'number' && typeof longitude === 'number') {
      try {
        const q = `
          query MatchRestaurantByCoordinates {
            restaurants(
              where: {
                _and: [
                  { latitude: { _is_null: false } }
                  { longitude: { _is_null: false } }
                ]
              }
            ) {
              id
              uuid
              title
              slug
              status
              listing_street
              phone
              menu_url
              longitude
              latitude
              featured_image_url
              average_rating
              ratings_count
              address
            }
          }
        `;

        const result = await hasuraAdminQuery<{ restaurants: any[] }>(q);
        const restaurants = result.data?.restaurants ?? [];

        let closest: any | null = null;
        let minDistance = Infinity;

        for (const r of restaurants) {
          if (typeof r.latitude !== 'number' || typeof r.longitude !== 'number') continue;
          const d = calculateDistanceKm(latitude, longitude, r.latitude, r.longitude);
          if (d < 0.1 && d < minDistance) {
            minDistance = d;
            closest = r;
          }
        }

        if (closest) {
          return res.status(200).json({
            match: true,
            restaurant: closest,
            matchType: 'coordinates',
          });
        }
      } catch {
        // continue
      }
    }

    return res.status(200).json({
      match: false,
      restaurant: null,
      matchType: null,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown error';
    return res.status(500).json({ success: false, error: 'Internal server error', message });
  }
}

