import { DisasterResponseDTO } from './disaster.dto';

describe('DisasterResponseDTO', () => {
  it('defaults status to active if missing', () => {
    const input = {
      _id: 'id',
      type: 'fire',
      location: { type: 'Point', coordinates: [1, 2] },
      date: '2025-01-01',
      description: 'desc',
      createdAt: '2025-01-01',
      updatedAt: '2025-01-02',
      // status missing
    };
    const dto = new DisasterResponseDTO(input as any);
    expect(dto.status).toBe('active');
  });

  it('uses status if present', () => {
    const input = {
      _id: 'id',
      type: 'fire',
      location: { type: 'Point', coordinates: [1, 2] },
      date: '2025-01-01',
      description: 'desc',
      createdAt: '2025-01-01',
      updatedAt: '2025-01-02',
      status: 'contained',
    };
    const dto = new DisasterResponseDTO(input as any);
    expect(dto.status).toBe('contained');
  });

  it('defaults source to official if missing', () => {
    const input = {
      id: 'test-id',
      type: 'fire',
      location: { type: 'Point', coordinates: [1, 2] },
      date: '2025-01-01',
      description: 'desc',
      status: 'active',
    };
    const dto = new DisasterResponseDTO(input as any);
    expect(dto.source).toBe('official');
    expect(dto.externalId).toBeNull();
    expect(dto.sourceUrl).toBeNull();
  });

  it('maps source fields when present', () => {
    const input = {
      id: 'test-id',
      type: 'wildfire',
      location: { type: 'Point', coordinates: [-9.1393, 38.7223] },
      date: '2025-08-01',
      description: 'Wildfire near Lisbon',
      status: 'active',
      source: 'fogos_pt',
      external_id: 'FOGOS-2025-001',
      source_url: 'https://fogos.pt/fogo/2025-001',
    };
    const dto = new DisasterResponseDTO(input as any);
    expect(dto.source).toBe('fogos_pt');
    expect(dto.externalId).toBe('FOGOS-2025-001');
    expect(dto.sourceUrl).toBe('https://fogos.pt/fogo/2025-001');
  });

  it('maps camelCase source fields when present', () => {
    const input = {
      id: 'test-id',
      type: 'wildfire',
      location: { type: 'Point', coordinates: [-9.1393, 38.7223] },
      date: '2025-08-01',
      description: 'Wildfire near Lisbon',
      status: 'active',
      source: 'prociv',
      externalId: 'PROCIV-2025-042',
      sourceUrl: 'https://prociv.gov.pt/event/042',
    };
    const dto = new DisasterResponseDTO(input as any);
    expect(dto.source).toBe('prociv');
    expect(dto.externalId).toBe('PROCIV-2025-042');
    expect(dto.sourceUrl).toBe('https://prociv.gov.pt/event/042');
  });

  it('maps distanceKm from snake_case distance_km', () => {
    const input = {
      id: 'test-id',
      type: 'wildfire',
      location: { type: 'Point', coordinates: [1, 2] },
      date: '2025-01-01',
      description: 'desc',
      status: 'active',
      source: 'official',
      distance_km: 12.345,
    };
    const dto = new DisasterResponseDTO(input as any);
    expect(dto.distanceKm).toBeCloseTo(12.345);
  });

  it('omits distanceKm when not present', () => {
    const input = {
      id: 'test-id',
      type: 'wildfire',
      location: { type: 'Point', coordinates: [1, 2] },
      date: '2025-01-01',
      description: 'desc',
      status: 'active',
      source: 'official',
    };
    const dto = new DisasterResponseDTO(input as any);
    expect(dto.distanceKm).toBeUndefined();
  });
});
