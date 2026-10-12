import { useState } from 'react'
import type { ChangeEvent, FormEvent } from 'react'
import { moderateImage } from '../api'
import type { CaseDetail, UploadPurpose } from '../types'
import { AnalyzingBanner, Spinner } from './Loading'
import './UploadPanel.css'

const PURPOSES: { value: UploadPurpose; label: string }[] = [
  { value: 'product_listing', label: 'Product listing photo' },
  { value: 'supplier_profile', label: 'Supplier profile photo' },
  { value: 'buyer_enquiry', label: 'Buyer enquiry attachment' },
  { value: 'review', label: 'Review photo' },
  { value: 'chat', label: 'Chat image' },
  { value: 'other', label: 'Other' },
]

export function UploadPanel({ onResult }: { onResult: (result: CaseDetail) => void }) {
  const [file, setFile] = useState<File | null>(null)
  const [preview, setPreview] = useState<string | null>(null)
  const [name, setName] = useState('')
  const [description, setDescription] = useState('')
  const [intendedUse, setIntendedUse] = useState('')
  const [uploadPurpose, setUploadPurpose] = useState<UploadPurpose>('product_listing')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  function handleFileChange(e: ChangeEvent<HTMLInputElement>) {
    const selected = e.target.files?.[0] ?? null
    setFile(selected)
    setPreview(selected ? URL.createObjectURL(selected) : null)
  }

  async function handleSubmit(e: FormEvent) {
    e.preventDefault()
    if (!file) {
      setError('Please choose an image to upload.')
      return
    }
    setLoading(true)
    setError(null)
    try {
      const result = await moderateImage({
        file,
        name,
        description,
        intendedUse,
        uploadPurpose,
      })
      onResult(result)
      setFile(null)
      setPreview(null)
      setName('')
      setDescription('')
      setIntendedUse('')
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Something went wrong.')
    } finally {
      setLoading(false)
    }
  }

  return (
    <form className="upload-panel card" onSubmit={handleSubmit}>
      <h2>Submit an image for moderation</h2>
      <p className="muted">
        Only an image is required. Adding a name, description, and intended use helps Claude understand the
        commercial context and reduces wrongful rejections.
      </p>

      <div className="upload-grid">
        <div className="upload-dropzone">
          <input id="image-input" type="file" accept="image/jpeg,image/png,image/webp,image/gif" onChange={handleFileChange} />
          <label htmlFor="image-input" className="dropzone-label">
            {preview ? (
              <img src={preview} alt="Selected preview" className="preview-image" />
            ) : (
              <span>Click to choose an image (JPEG, PNG, WEBP, GIF)</span>
            )}
          </label>
        </div>

        <div className="upload-fields">
          <label>
            Image / product name
            <input value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. Stainless steel chef knife 8-inch" />
          </label>

          <label>
            Description
            <textarea
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="Describe what the image shows and any relevant detail"
              rows={3}
            />
          </label>

          <label>
            Intended use
            <input
              value={intendedUse}
              onChange={(e) => setIntendedUse(e.target.value)}
              placeholder="e.g. Main photo on a kitchenware product listing"
            />
          </label>

          <label>
            Upload purpose
            <select value={uploadPurpose} onChange={(e) => setUploadPurpose(e.target.value as UploadPurpose)}>
              {PURPOSES.map((p) => (
                <option key={p.value} value={p.value}>
                  {p.label}
                </option>
              ))}
            </select>
          </label>
        </div>
      </div>

      {error && <div className="error-banner">{error}</div>}

      {loading && <AnalyzingBanner text="Claude is examining the image and your context…" />}

      <button type="submit" className="btn btn-primary" disabled={loading}>
        {loading && <Spinner />}
        {loading ? 'Analyzing with Claude…' : 'Submit for moderation'}
      </button>
    </form>
  )
}
