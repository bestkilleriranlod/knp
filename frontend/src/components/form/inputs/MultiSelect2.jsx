import { useEffect, useState } from 'react'
import Box from '@mui/material/Box'
import InputLabel from '@mui/material/InputLabel'
import MenuItem from '@mui/material/MenuItem'
import FormControl from '@mui/material/FormControl'
import Select from '@mui/material/Select'
import axios from 'axios'

export default function BasicSelect({ onChange, defaultValue, id, disabled }) {
  const [age, setAge] = useState(defaultValue)
  const [panels, setPanels] = useState([])

  const handleChange = (event) => {
    setAge(event.target.value)
    if (onChange) {
      onChange(event.target.value)
    }
  }

  useEffect(() => {
    setAge(defaultValue)
  }, [defaultValue])

  const agent = JSON.parse(sessionStorage.getItem("agent"))

  useEffect(() => {
    const fetchPanels = async () => {
      try {
        const access_token = sessionStorage.getItem("access_token")
        const response = await axios.post("/get_panels", { access_token })
        if (response.data.status !== "ERR") {
          setPanels(response.data)
        }
      } catch (error) {
        console.error("خطا در دریافت اطلاعات پنل‌ها:", error)
      }
    }
    
    fetchPanels()
  }, [])

  const getPanelInfo = (countryCode) => {
    const panel = panels.find(panel => panel.panel_country === countryCode)
    if (panel) {
      const remainingCapacity = panel.panel_user_max_count - panel.active_users
      return {
        name: panel.panel_name,
        remainingCapacity: remainingCapacity > 0 ? remainingCapacity : 0
      }
    }
    return { name: countryCode, remainingCapacity: 0 }
  }

  return (
    <Box sx={{ width: '100%' }}>
      <FormControl fullWidth>
        <InputLabel id="demo-simple-select-label"></InputLabel>
        <Select sx={{ height: 34 }}
          labelId="demo-simple-select-label"
          id={id}
          value={age}
          label=""
          onChange={handleChange}
          disabled={disabled}
        >
          {agent.country.split(",").map((item) => {
            const panelInfo = getPanelInfo(item)
            return (
              <MenuItem key={item} value={item}>
                {panelInfo.name} (ظرفیت: {panelInfo.remainingCapacity})
              </MenuItem>
            )
          })}
        </Select>
      </FormControl>
    </Box>
  )
}
