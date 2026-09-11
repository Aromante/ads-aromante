import { Component, inject, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { Router } from '@angular/router';
import { SupabaseService } from '../../core/services/supabase.service';
import { AdDim } from '../../core/models/meta.models';

interface DuplicateGroup {
  creative_base: string;
  ads: { ad_id: string; ad_name: string; campaign_name: string; status: string }[];
}

@Component({
  selector: 'app-duplicates',
  standalone: true,
  imports: [CommonModule],
  templateUrl: './duplicates.component.html',
  styleUrl: './duplicates.component.scss'
})
export class DuplicatesComponent implements OnInit {
  private supa = inject(SupabaseService);
  private router = inject(Router);

  loading = true;
  error = '';
  groups: DuplicateGroup[] = [];

  async ngOnInit() {
    try {
      const dims = await this.supa.selectWithFilter<AdDim>(
        'meta_ads_dim',
        'ad_id,ad_name,campaign_name,creative_base,status',
        q => q.is('valid_to', null) // currently valid
      );

      // Group by creative_base, keep only groups with >1 active ad
      const byBase = new Map<string, DuplicateGroup>();
      for (const d of dims) {
        if (!d.creative_base) continue;
        if (!byBase.has(d.creative_base)) {
          byBase.set(d.creative_base, { creative_base: d.creative_base, ads: [] });
        }
        byBase.get(d.creative_base)!.ads.push({
          ad_id: d.ad_id,
          ad_name: d.ad_name,
          campaign_name: d.campaign_name,
          status: d.status
        });
      }

      this.groups = [...byBase.values()]
        .filter(g => g.ads.filter(a => a.status === 'ACTIVE').length > 1)
        .sort((a, b) => b.ads.length - a.ads.length);
    } catch (e: any) {
      this.error = e.message ?? 'Error loading dimension data';
    } finally {
      this.loading = false;
    }
  }

  goToAd(adId: string) {
    this.router.navigate(['/ad', adId]);
  }
}
