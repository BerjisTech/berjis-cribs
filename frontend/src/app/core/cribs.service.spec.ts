import { HttpClientTestingModule, HttpTestingController } from "@angular/common/http/testing";
import { TestBed } from "@angular/core/testing";
import { CribsService } from "./cribs.service";
import { PropertyMedia } from "../shared/models";

describe("CribsService", () => {
  let service: CribsService;
  let httpMock: HttpTestingController;
  const baseUrl = "http://localhost:8095";

  beforeEach(() => {
    TestBed.configureTestingModule({
      imports: [HttpClientTestingModule],
    });

    service = TestBed.inject(CribsService);
    httpMock = TestBed.inject(HttpTestingController);
  });

  afterEach(() => {
    httpMock.verify();
  });

  it("builds query params for public property search", () => {
    service.getPublicProperties({ q: "Downtown", landlordId: "abc", limit: 10, bbox: "" }).subscribe();

    const req = httpMock.expectOne(`${baseUrl}/v1/public/properties?q=Downtown&landlordId=abc&limit=10`);
    expect(req.request.method).toBe("GET");
    req.flush({ success: true, data: [] });
  });

  it("creates property media with sanitized payload", () => {
    const payload = { kind: "interior", url: "https://cdn.berjis.tech/house.jpg", caption: "Hallway" };
    let response: PropertyMedia | undefined;

    service.addMedia("property-1", payload).subscribe((data) => {
      response = data;
    });

    const req = httpMock.expectOne(`${baseUrl}/v1/landlord/properties/property-1/media`);
    expect(req.request.method).toBe("POST");
    expect(req.request.body).toEqual(payload);
    req.flush({ success: true, data: { id: "media-1", propertyId: "property-1", kind: "interior", url: payload.url, caption: payload.caption } });

    expect(response?.id).toBe("media-1");
    expect(response?.url).toBe(payload.url);
  });
});
